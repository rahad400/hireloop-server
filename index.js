import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 8000;
// middleware
app.use(express.json());
app.use(cors());

const client = new MongoClient(
  `mongodb+srv://${process.env.MOMGODB_USER_ID}:${process.env.MONGODB_PASS}@cluster0.u23ovjm.mongodb.net/`,
);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
};

const hireloopConnect = await connectToMongoDB()

app.get("/", (req, res) => {
  res.send("hello Hireloop-Server");
});

app.listen(port, () => {
  console.log(`Hireloop-server is runing ${port}`);
});
