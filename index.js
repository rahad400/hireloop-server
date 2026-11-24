import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.PORT || 8000;
// middleware
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const authBaseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

app.use(express.json());
app.use(cors({ origin: clientOrigin, credentials: true }));

/** Ask the Next.js auth route who is signed in, then trust that user id. */
async function getAuthenticatedUser(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;

  try {
    const response = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const session = await response.json();
    return session?.user ?? null;
  } catch (error) {
    console.error("Could not verify session:", error.message);
    return null;
  }
}

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
const applications = database.collection("aplication");

// One application per user + job. The partial filter keeps older test records
// (which have no dedupeKey) from blocking the index; every new application
// carries a dedupeKey, so new duplicates are rejected by MongoDB itself.
await applications.createIndex(
  { userId: 1, jobId: 1 },
  {
    name: "application_user_job_uidx",
    unique: true,
    partialFilterExpression: { dedupeKey: { $exists: true } },
  },
);

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

    const {
      search,
      type,
      category,
      status,
      location,
      company,
      frequency,
      isRemote,
    } = req.query;

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

app.patch("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  const cursor = await jobs.updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body },
  );
  res.send(cursor);
});

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

// View details page api
app.get("/job/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await jobs.findOne(query);
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch job details",
      error: error.message,
    });
  }
});

// aplication api
app.post("/application", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).send({ error: "You must be signed in to apply." });
  }

  if (user.role && user.role !== "candidate") {
    return res
      .status(403)
      .send({ error: "Only candidates can apply for jobs." });
  }

  const { jobId } = req.body ?? {};
  if (typeof jobId !== "string" || !jobId.trim()) {
    return res.status(400).send({ error: "jobId is required" });
  }

  if (!ObjectId.isValid(jobId)) {
    return res.status(400).send({ error: "Invalid job id" });
  }

  // The signed-in user id is the source of truth; never trust req.body.userId.
  const userId = user.id;
  const existingApplication = await applications.findOne({ userId, jobId });
  if (existingApplication) {
    return res
      .status(409)
      .send({ error: "You have already applied for this job." });
  }

  const job = await jobs.findOne({ _id: new ObjectId(jobId) });
  if (!job) {
    return res.status(404).send({ error: "Job not found" });
  }

  const application = {
    userId,
    jobId,
    email: user.email,
    name: user.name,
    jobTitle: job.title,
    company: job.company,
    appliedAt: new Date().toISOString(),
    dedupeKey: `${userId}:${jobId}`,
  };

  try {
    const result = await applications.insertOne(application);
    res.send(result);
  } catch (error) {
    // The unique index is the final guard if two requests arrive together.
    if (error?.code === 11000) {
      return res
        .status(409)
        .send({ error: "You have already applied for this job." });
    }
    throw error;
  }
});

app.get("/application", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).send({ error: "You must be signed in." });
  }

  const result = await applications
    .find({ userId: user.id })
    .sort({ _id: -1 })
    .toArray();
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("hello Hireloop-Server");
});

app.listen(port, () => {
  console.log(`Hireloop-server is runing ${port}`);
});
