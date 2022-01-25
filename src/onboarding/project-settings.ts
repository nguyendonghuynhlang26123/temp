import {
  CreateProjectParams,
  AddMetadataSchemaToCollectionParams,
  MetadataTypes,
} from '@imtbl/imx-sdk';

// 2.Create project details
export const projectConfig: CreateProjectParams = {
  name: 'TIXNGO-NFL',
  company_name: 'TIXNGO SA',
  contact_email: 'tools@tixngo.io',
};

// 3.Create collection
export const collectionConfig = {
  name: 'Pro Bowl 2022',
  description: 'A souvenir NFT for NFL PRO BOWL 2022 TEST',
  icon_url: 'https://r.tixngo.io/tixngo-nft/tixngo-nfl/logo.jpg',
  collection_image_url: 'https://r.tixngo.io/nfl/banner.jpg',
  metadata_api_url: 'https://r.tixngo.io/tixngo-nft/tixngo-nfl/metadata',
};

// 4. Add metadata
export const metadataConfig: AddMetadataSchemaToCollectionParams = {
  metadata: [
    // auto display on market view
    {
      name: 'ticket_id',
      type: MetadataTypes.Text,
    },
    {
      name: 'name',
      type: MetadataTypes.Text,
    },
    {
      name: 'image', // or 'image'
      type: MetadataTypes.Text,
    },
    {
      name: 'description',
      type: MetadataTypes.Text,
      filterable: false,
    },

    //-- EVENT info --
    {
      name: 'event_name',
      type: MetadataTypes.Text,
    },
    {
      name: 'event_date',
      type: MetadataTypes.Text,
    },
    {
      name: 'event_address',
      type: MetadataTypes.Text,
    },

    // -- Seat info --
    {
      name: 'section',
      type: MetadataTypes.Text,
    },
    {
      name: 'row',
      type: MetadataTypes.Text,
    },
    {
      name: 'seat',
      type: MetadataTypes.Text,
    },
  ],
};
