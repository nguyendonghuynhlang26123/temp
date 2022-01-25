import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'ts-command-line-args';
import env from '../config/client';

import { ImLogger, WinstonLogger } from '@imtbl/imlogging';
import { loggerConfig } from '../config/logging';
import { CSVToArray } from './utils';
import { genImage } from './image-gen';

//Logging
const log: ImLogger = new WinstonLogger(loggerConfig);
const component = 'script-metadata';

interface JsonType {
  [k: string]: any;
}

interface MapJsonNameToObject {
  [jsonName: string]: JsonType;
}

interface ScriptArgs {
  fname: string;
}

const SHOULD_NOT_INCLUDE: string[] = ['token_id', 'user_id', 'image'];
const IMAGE_HOST_PREFIX = 'https://r.tixngo.io/tixngo-nft/tixngo-nfl/images';
const IMAGE_EXTENSION_NAME = 'png';

/**
 * This function will read the content of a json object, and apply a few rules (i.e: add/remove unnecessary parts)
 * @param json the targeting json object
 * @returns a filtered and modified json object
 */
const globalProcess = (json: JsonType): JsonType => {
  const result = { ...json }; // Deep copy to avoid mutating problem
  const tokenId = result.token_id;
  for (const key of SHOULD_NOT_INCLUDE) delete result[key];
  result.image = `${IMAGE_HOST_PREFIX}/${tokenId}.${IMAGE_EXTENSION_NAME}`;
  return result;
};

/**
 * This function will read the content of csv file, and store it in a special data structure
 * @param fpath CSV file name
 * @param maxCapacity Maximum number of line restricted
 * @returns a mapping tokenId => string array (JSON formatted)
 */
const loadAllCsv = (fname: string): MapJsonNameToObject => {
  log.info(component, 'Start reading CSV file ' + fname);

  const response: MapJsonNameToObject = {};

  /// Read all data from a csv and store them to memory
  const [keys, ...rows] = CSVToArray(
    fs.readFileSync(path.resolve(__dirname, 'input', fname), 'utf-8'),
  );

  for (let i = 0; i < rows.length; i++) {
    const data = rows[i];
    if (!data || !data.length) throw new Error('Invalid CSV at row=' + i);

    const json: JsonType = {};
    data.forEach((value: string, index: number) => {
      const key = keys[index];
      json[key] = value;
    });

    const tokenId = data[0]; // Assume that TokenId should be the first element
    response[tokenId] = globalProcess(json);
  }

  return response;
};

/**
 * Generate 2 file: A metadata at path ('./output/metadata/${tokenId}), and a ticket image ('./output/images/${tokenId})
 * @param tokenId File name is represented by an token id
 * @param jsonContent The token info
 * @returns true if succeeded, and vice versa.
 */
const generateFiles = async (
  tokenId: string,
  data: JsonType,
): Promise<boolean> => {
  try {
    await genImage(
      `${tokenId}.${IMAGE_EXTENSION_NAME}`,
      data.section,
      data.row,
      data.seat,
    );
    log.info(
      component,
      `Finish generating image at ./output/images/${tokenId}`,
    );
    await fs.writeFileSync(
      path.resolve(__dirname, 'output', 'metadata', tokenId.toString()),
      JSON.stringify(data, null, 4),
      'utf8',
    );
    log.info(
      component,
      `Finish writing metadata file to ./output/metadata/${tokenId}`,
    );
  } catch (err: any) {
    log.error(component, err as Error);
    return false;
  }

  return true;
};

/**
 * A script that read CSV and convert them to JSON
 *
 * TODO: Implement Upload to S3 function!!!
 * It take these input
 *    *From commandline:
 *    -f :                            Filename (it should be placed in the poc/input folder) and it should have the format of
 *                                    <tokenId>,<ticketId>,<user id>,<onchain metadata1>,<onchain metadata 2>, ...
 */
(async (): Promise<void> => {
  /// Setup
  const { fname } = parse<ScriptArgs>({
    fname: {
      type: String,
      alias: 'f',
      description: 'Csv input file',
    },
  });

  log.info(
    component,
    'Start metadata generating script with file input=' + fname,
  );

  // 1. Read all csv content and load them into special data structure
  const toBeUploaded: MapJsonNameToObject = loadAllCsv(fname);

  // 2. Run upload and pray~
  const failures = [];
  for (const tokenId in toBeUploaded) {
    const result = await generateFiles(tokenId, toBeUploaded[tokenId]);
    if (!result) failures.push(toBeUploaded[tokenId]);
  }

  log.info(
    component,
    `Finish generating! Falures (${failures.length}): ${failures.toString()}`,
  );
})().catch(e => {
  log.error(component, e);
  process.exit(1);
});
