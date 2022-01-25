import { AlchemyProvider, InfuraProvider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
import { ImLogger, WinstonLogger } from '@imtbl/imlogging';
import { ImmutableMethodParams, ImmutableXClient } from '@imtbl/imx-sdk';

//Utils
import { parse } from 'ts-command-line-args';
import env from '../config/client';
import { loggerConfig } from '../config/logging';
import { CSVToArray } from './utils';

//sub-components
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';

interface ScriptArgs {
  fname: string;
  address: string;
}

const provider = new AlchemyProvider(env.ethNetwork, env.alchemyApiKey);
const log: ImLogger = new WinstonLogger(loggerConfig);
const component = 'script-main';

type MintPayloadType = ImmutableMethodParams.ImmutableOffchainMintV2ParamsTS;
interface Token {
  tokenId: string; // token id
  ticketId: string; // ticket id
  userId: string; // ticket id
  blueprint: string; //On chain metadata
}

interface WalletToTokens {
  [privateKey: string]: Token[];
}

interface OutputJson {
  address: string;
  privateKey: string;
  publicKey: string;
  userId: string;
  assets: {
    ticketId: string;
    tokenId: string;
  }[];
}

/**
 * This function will read the content of csv file, generate account if needed, and return the argument for the mint script!
 * @param fpath CSV file name
 * @returns A special data structure (privatekey -> Token[]) as the input for our script
 */
const preprocessCsv = (fname: string): WalletToTokens => {
  log.info(component, 'Start reading CSV file ' + fname);

  /// 1. Read all data from a csv and store them to memory (skip header)
  const [, ...lines] = CSVToArray(
    fs.readFileSync(path.resolve(__dirname, 'input', fname), 'utf-8'),
  );

  /// 2. Read each line of csv:
  const mapUserToTheirTokens: WalletToTokens = {};
  const accountCache: { [userId: string]: string } = {}; // Make sure that only generate account if needed
  for (const line of lines) {
    const [tokenId, ticketId, userId, ...other] = line;

    /// 2a. Generate an account for userId (if needed)
    let privateKey = undefined;
    if (accountCache.hasOwnProperty(userId)) privateKey = accountCache[userId];
    else {
      privateKey = ethers.Wallet.createRandom().privateKey;
      accountCache[userId] = privateKey;
    }
    log.info(
      component,
      `Generate wallet with privateKey=${privateKey} for userId=${userId} `,
    );

    /// 2b. Add them to special data structure (prvKey -> Token[])
    const token: Token = {
      tokenId: tokenId,
      ticketId: ticketId,
      userId: userId,
      blueprint: other.join('-'), // ? Should we store other data from the csv as an immutable on-chain data
    };
    if (!mapUserToTheirTokens.hasOwnProperty(privateKey))
      mapUserToTheirTokens[privateKey] = [];
    mapUserToTheirTokens[privateKey].push(token);
  }

  return mapUserToTheirTokens;
};

/**
 * A helper function to Poll until the transaction is complete - which means account is confirmed registered
 */
const waitForTransaction = async (promise: Promise<string>) => {
  const txId = await promise;
  log.info(component, 'Waiting for transaction', {
    txId,
    etherscanLink: `https://ropsten.etherscan.io/tx/${txId}`,
    alchemyLink: `https://dashboard.alchemyapi.io/mempool/eth-ropsten/tx/${txId}`,
  });
  const receipt = await provider.waitForTransaction(txId);
  if (receipt.status === 0) {
    throw new Error('Transaction rejected');
  }
  log.info(component, `Transaction Mined: ${receipt.blockNumber}`);
  return receipt;
};

/**
 * Try to register imx account (if it has not be registered yet)
 * @param privateKey The private key of the account we want to register (we need this for signing purpose)
 * @returns address of the registered account
 */
const tryToRegisterImxAccount = async (privateKey: string) => {
  const user = await ImmutableXClient.build({
    ...env.client,
    signer: new Wallet(privateKey).connect(provider),
  });

  const registerImxResult = await user.registerImx({
    etherKey: user.address.toLowerCase(),
    starkPublicKey: user.starkPublicKey,
  });

  if (registerImxResult.tx_hash === '') {
    log.info(component, `User ${user.address} registered, continuing...`);
  } else {
    log.info(
      component,
      `Register ${user.address} in progress! Waiting for confirmation...`,
    );
    await waitForTransaction(Promise.resolve(registerImxResult.tx_hash));
  }

  return user.address;
};

/**
 * Outputing wallet credentials to json file
 * @param mapUserToTheirTokens (privateKey => Token[])
 * @ouput Output an json file at current directory, which contains a wallet and its assets
 */
const outputJsonFile = (mapUserToTheirTokens: WalletToTokens) => {
  const jsons: OutputJson[] = [];
  for (const privateKey in mapUserToTheirTokens) {
    const wallet = new Wallet(privateKey);
    const tokens = Array.from(mapUserToTheirTokens[privateKey]);

    jsons.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      userId: tokens[0].userId,
      assets: tokens.map((t: Token) => ({
        ticketId: t.ticketId,
        tokenId: t.tokenId,
      })),
    });
  }

  fs.writeFileSync(
    path.resolve(__dirname, 'output', 'output.json'),
    JSON.stringify(jsons, null, 4),
    'utf8',
  );
};

/**
 * A script that perform these operations steps by steps:
 *    1. Read all data from csv. For each CSV line
 *      a. Read {tokenId, ticketId, userId, metadata1, metadata2} from each line
 *      b. Generate a wallet for each specific userId (if it not existed)
 *      c. Store it in memory! with data structure: {privateKey => Token[]}
 *    2. Make sure that all account is registered with IMX service
 *    3. Convert the data structure to the MintV2 Payload
 *    4. Call Mint API
 *    5. Outputing the data structure as JSON
 * It take these input
 *    *From commandline:
 *    -a :                            Smart contract token address!
 *    -f :                            Filename (it should be placed in the poc/input folder) and it should have the format of
 *                                    <tokenId>,<ticketId>,<user id>,<onchain metadata1>,<onchain metadata 2>, ...
 *
 *    *From Environment file (default from imx-examples):
 *    privateKey1:                    Minter private key
 *    publicApiUrl:                   The imx service's api endpoint
 *    starkContractAddress:           Stark smart contract (ZK rollup base)
 *    registrationContractAddress:    IMX contract for registering account
 *    gasLimit:                       Gas limit
 *    gasPrice:                       Gas price of transaction
 *    ethNetwork:                     "mainet" or "ropsten"
 *    alchemyApiKey:                  Like a Infura node for production
 */
(async (): Promise<void> => {
  /// Setup
  const { fname, address } = parse<ScriptArgs>({
    fname: {
      type: String,
      alias: 'f',
      description: 'Csv input file',
    },
    address: {
      type: String,
      alias: 'a',
      description: 'Contract address',
    },
  });
  const minter = await ImmutableXClient.build({
    ...env.client,
    signer: new Wallet(env.privateKey1).connect(provider),
  });

  const payload: MintPayloadType = [
    {
      contractAddress: address,
      users: [],
    },
  ];

  // 1. Resolve the input file
  const mapUserToTheirTokens: WalletToTokens = preprocessCsv(fname);

  // 2. Try to make sure that all the participated account is registered in IMX
  await tryToRegisterImxAccount(env.privateKey1); // Start with Minter account
  for (const privateKey in mapUserToTheirTokens) {
    const address = await tryToRegisterImxAccount(privateKey);
    const tokens = Array.from(mapUserToTheirTokens[privateKey]);

    // 3. Try to convert the data structure to the mintV2 payload
    payload[0].users.push({
      etherKey: address,
      tokens: tokens.map((t: Token) => ({
        id: t.tokenId,
        blueprint: t.blueprint,
      })),
    });
  }

  // 4. Mint and pray~!
  const result = await minter.mintV2(payload);
  console.log(result);

  // 5. Outputing them
  outputJsonFile(mapUserToTheirTokens);
})().catch(e => {
  log.error(component, e);
  process.exit(1);
});
