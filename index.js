import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

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
}

const hireloopConnect = await connectToMongoDB();
const database = hireloopConnect.db("hire-client");
const user = database.collection("user");
const jobs = database.collection("jobs");

// user api
app.get("/user", async (req, res) => {
  const cursor = await user.find({}).toArray();
  res.send(cursor);
});

// jobs create api
app.post("/jobs", async (req, res) => {
  const job = req.body;
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return res
      .status(400)
      .send({ error: "Request body must be a JSON object" });
  }
  const result = await jobs.insertOne(job);
  res.send(result);
});

app.get("/jobs", async (req, res) => {
  try {
    const query = {};

    const { search, type, category, status } = req.query;

    // Search by title, responsibilities, requirements
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { responsibilities: { $regex: search, $options: "i" } },
        { requirements: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by job type
    if (type) {
      query.type = type;
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    const result = await jobs.find(query).toArray();

    res.status(200).send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch jobs",
      error: error.message,
    });
  }
});

// Update Details API

app.patch('/jobs/:id', async(req,res)=>{
  const id = req.params.id;
  const cursor = await jobs.updateOne({_id:new ObjectId(id)},{$set:req.body})
res.send(cursor)
})


// delete API
app.delete("/jobs/:id", async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid job id" });
  }

  const result = await jobs.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return res.status(404).send({ error: "Job not found" });
  }

  res.send(result);
});


app.get("/", (req, res) => {
  res.send("hello Hireloop-Server");
});

app.listen(port, () => {
  console.log(`Hireloop-server is runing ${port}`);
});
