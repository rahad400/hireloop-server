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

    const { search, type, category, status, location, company, frequency, isRemote } =
      req.query;

    // Search by title, responsibilities, requirements
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { responsibilities: { $regex: search, $options: "i" } },
        { requirements: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by job type
    if (type && type !== "all") {
      query.type = type;
    }

    // Filter by category
    if (category && category !== "all") {
      query.category = category;
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by location
    if (location && location !== "all") {
      query.location = location;
    }

    // Filter by company
    if (company && company !== "all") {
      query.company = company;
    }

    // Filter by salary frequency
    if (frequency && frequency !== "all") {
      query.frequency = frequency;
    }

    // Filter by work mode ("remote" / "onsite" map to the boolean field)
    if (isRemote === "remote") {
      query.isRemote = true;
    } else if (isRemote === "onsite") {
      query.isRemote = false;
    }

    // Sort the results. `_id` is an ObjectId, so it also works as a
    // "newest first" marker even though jobs have no createdAt field.
    const sort = req.query.sort;
    let result;

    if (sort === "highest-salary") {
      // Salaries are stored as strings, so convert them to numbers first.
      result = await jobs
        .aggregate([
          { $match: query },
          {
            $addFields: {
              salaryRank: {
                $convert: {
                  input: "$maxSalary",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
          { $sort: { salaryRank: -1, _id: -1 } },
          { $project: { salaryRank: 0 } },
        ])
        .toArray();
    } else {
      // "oldest" is the only ascending order. "most-recent" and
      // "most-relevant" (no relevance score yet) fall back to newest first.
      const direction = sort === "oldest" ? 1 : -1;
      result = await jobs.find(query).sort({ _id: direction }).toArray();
    }

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
