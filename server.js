const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Client } = require("pg");
const app = express();
const port = 8080;

const ITEM_DETAILS = "https://connect.squareup.com/v2/catalog/list?types=ITEM";

const client = new Client({
  host: "127.0.0.1",
  user: "postgres",
  port: 5432,
  password: "ResPsql987",
  database: "squareup",
});

client.connect();

app.use(cors());
app.use(bodyParser.json());

const squareClient = new Client({
  environment: "sq0idp-QAkjZ8io_qjcHBAl1cHMUA",
  accessToken:
    "EAAAlihPILLOzdCAYu5Mv8SahdBgY6yq-dJmxahYbEjJ7w9EMRN6s5xUcaHz8Pce",
});

// Call the function to create the table if it doesn't exist
const createTableIfNotExists = async () => {
  const createSquareupTableQuery = `
     CREATE TABLE IF NOT EXISTS squareup (
      item_id VARCHAR(50) PRIMARY KEY,
      variant_id VARCHAR(1000),
      name VARCHAR(1000),
      variant_name VARCHAR(1000),
      attributes VARCHAR(1000),
      price NUMERIC(10, 2),
      modifier_groups VARCHAR(1000),
      categories VARCHAR(1000),
      modifier_name VARCHAR(1000),
      modifier_price NUMERIC(10, 2),
      updated_at TIMESTAMP WITH TIME ZONE
    );
  `;
  try {
    await client.query(createSquareupTableQuery);
    console.log("Table created successfully");
  } catch (error) {
    console.error("Error creating table:", error.message);
  }
};

app.post("/", async (req, res) => {
  try {
    await createTableIfNotExists();

    const isEmpty = await isDatabaseEmpty(); // Check if database is empty
    console.log("isEmpty: ", isEmpty);

    const itemsResponse = await getData(ITEM_DETAILS);
    const items = itemsResponse.objects.map((item) => {
      const itemData = item.item_data;
      const itemVariation = item.item_data.variations;

      return {
        item_id: item.id,
        variant_id:
          itemData.variations && itemData.variations.length > 0
            ? itemData.variations[0].id
            : null,
        name: itemData.name,
        variant_name:
          itemData.variations && itemData.variations.length > 0
            ? itemData.variations[0].item_variation_data.name
            : null,
        attributes: JSON.stringify(
          itemData.variations && itemData.variations.length > 0
            ? itemData.variations[0].item_variation_data
            : {}
        ),
        price:
          itemData.variations && itemData.variations.length > 0
            ? itemData.variations[0].item_variation_data.price_money.amount /
              100
            : null,
        modifier_groups: JSON.stringify(item.item_data.modifier_list_info),
        categories: JSON.stringify(item.item_data.categories),
        modifier_name: null,
        modifier_price: null,
        updated_at: item.updated_at,
      };
    });
    for (const item of items) {
      await updateItemIfNewer(item);
    }
    // console.log(items, "items");

    // Insert items into the database
    if (isEmpty) {
      for (const item of items) {
        const query = {
          text: `
            INSERT INTO squareup (
              item_id, 
              variant_id, 
              name, 
              variant_name, 
              attributes, 
              price, 
              modifier_groups, 
              categories, 
              modifier_name, 
              modifier_price, 
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          values: [
            item.item_id,
            item.variant_id,
            item.name,
            item.variant_name,
            item.attributes,
            item.price,
            item.modifier_groups,
            item.categories,
            item.modifier_name,
            item.modifier_price,
            item.updated_at,
          ],
        };
        await client.query(query);
      }

      // console.log("Items inserted successfully");
    }

    const itemsFromApi = itemsResponse.objects.map((item) => item.id);

    // Retrieve IDs from the database
    const { rows: itemsFromDb } = await client.query(
      "SELECT item_id FROM squareup"
    );
    const itemsFromDbIds = itemsFromDb.map((item) => item.item_id);

    // Find IDs that are in the API but not in the database
    const missingInDb = itemsFromApi.filter(
      (itemId) => !itemsFromDbIds.includes(itemId)
    );
    console.log("Missing in DB:", missingInDb);

    // Find IDs that are in the database but not in the API
    const missingInApi = itemsFromDbIds.filter(
      (itemId) => !itemsFromApi.includes(itemId)
    );
    console.log("Missing in API:", missingInApi);

    for (const itemId of missingInDb) {
      const item = items.find((obj) => obj.item_id === itemId);
      await insertItemToDb(item);
    }

    // Delete items from the database
    for (const itemId of missingInApi) {
      await deleteItemFromDb(itemId);
    }
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/data", async (req, res) => {
  const items = await getData(ITEM_DETAILS);
  res.status(200).json({ message: items });
});

// Function to check if the database is empty
const isDatabaseEmpty = async () => {
  const result = await client.query("SELECT EXISTS (SELECT 1 FROM squareup)");
  return !result.rows[0].exists;
};

// Function to fetch data from Square API
const getData = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Bearer EAAAlihPILLOzdCAYu5Mv8SahdBgY6yq-dJmxahYbEjJ7w9EMRN6s5xUcaHz8Pce",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  }
};

// Function to find missing items in the database
const insertItemToDb = async (item) => {
  const query = {
    text: `
      INSERT INTO squareup (
        item_id, 
        variant_id, 
        name, 
        variant_name, 
        attributes, 
        price, 
        modifier_groups, 
        categories, 
        modifier_name, 
        modifier_price, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    values: [
      item.item_id,
      item.variant_id,
      item.name,
      item.variant_name,
      item.attributes,
      item.price,
      item.modifier_groups,
      item.categories,
      item.modifier_name,
      item.modifier_price,
      item.updated_at,
    ],
  };
  await client.query(query);
  console.log(item, "insertItemToDb");
  // Insert item into the database
};

const updateItemIfNewer = async (item) => {
  // Fetch the current item from the database
  const {
    rows: [currentItem],
  } = await client.query("SELECT * FROM squareup WHERE item_id = $1", [
    item.item_id,
  ]);

  // If the item exists and the API's updated_at is more recent, update the item
  if (
    currentItem &&
    new Date(item.updated_at) > new Date(currentItem.updated_at)
  ) {
    const updateQuery = {
      text: `
         UPDATE squareup SET
           variant_id = $1,
           name = $2,
           variant_name = $3,
           attributes = $4,
           price = $5,
           modifier_groups = $6,
           categories = $7,
           modifier_name = $8,
           modifier_price = $9,
           updated_at = $10
         WHERE item_id = $11
       `,
      values: [
        item.variant_id,
        item.name,
        item.variant_name,
        item.attributes,
        item.price,
        item.modifier_groups,
        item.categories,
        item.modifier_name,
        item.modifier_price,
        item.updated_at,
        item.item_id,
      ],
    };
    await client.query(updateQuery);
    console.log(`Item updated: ${item.item_id}`);
  }
};

// Function to delete a single item from the database
const deleteItemFromDb = async (itemId) => {
  const deleteItemQuery = {
    text: `DELETE FROM squareup WHERE item_id = '${itemId}'`,
  };
  await client.query(deleteItemQuery);
  console.log("deleteItemFromDb: ", itemId);
};

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
