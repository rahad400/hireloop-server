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
const  database = hireloopConnect.db('hire-client')
const user = database.collection('user')
const jobs = database.collection('jobs');

app.get('/user', async (req,res)=>{
    const cursor = await user.find({}).toArray()
    res.send(cursor)
});

app.post('/jobs',async(req,res)=>{
  const job = req.body
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    return res.status(400).send({ error: 'Request body must be a JSON object' })
  }
  const result = await jobs.insertOne(job)
  res.send(result)
})


app.get('/jobs', async (req,res) =>{
  const job = await jobs.find({}).toArray()  
  res.send(job)
})

app.get("/", (req, res) => {
  res.send("hello Hireloop-Server");
});

app.listen(port, () => {
  console.log(`Hireloop-server is runing ${port}`);
});
