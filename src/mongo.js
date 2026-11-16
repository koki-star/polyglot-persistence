// NoSQL side: MongoDB. One "projects" collection.
// Each project document has its tasks embedded in a "tasks" array.
const { MongoClient, ObjectId } = require('mongodb');

async function openMongo(uri, dbName) {
  const client = new MongoClient(uri);
  await client.connect();
  const projects = client.db(dbName).collection('projects');
  return { client, projects };
}

function toId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function mongoRepo(projects) {
  return {
    list: () => projects.find().sort({ createdAt: 1 }).toArray(),

    // One query returns the project with all its tasks. No join needed.
    get: (id) => projects.findOne({ _id: id }),

    async create(name, description, tasks) {
      const now = new Date();
      const doc = {
        name,
        description,
        tasks: tasks.map((t) => ({ _id: new ObjectId(), title: t.title, status: t.status, createdAt: now, updatedAt: now })),
        createdAt: now,
        updatedAt: now,
      };
      const result = await projects.insertOne(doc);
      return { ...doc, _id: result.insertedId };
    },

    update: (id, name, description) => projects.findOneAndUpdate(
      { _id: id },
      { $set: { name, description, updatedAt: new Date() } },
      { returnDocument: 'after' },
    ),

    remove: async (id) => (await projects.deleteOne({ _id: id })).deletedCount > 0,

    // $push adds one task to the embedded array
    addTask(id, title, status) {
      const now = new Date();
      const task = { _id: new ObjectId(), title, status, createdAt: now, updatedAt: now };
      return projects.findOneAndUpdate(
        { _id: id },
        { $push: { tasks: task }, $set: { updatedAt: now } },
        { returnDocument: 'after' },
      );
    },

    // Positional $ updates only the matching task, in one atomic step
    updateTask: (id, taskId, title, status) => projects.findOneAndUpdate(
      { _id: id, 'tasks._id': taskId },
      { $set: { 'tasks.$.title': title, 'tasks.$.status': status, 'tasks.$.updatedAt': new Date() } },
      { returnDocument: 'after' },
    ),

    // $pull removes one task from the array
    removeTask: (id, taskId) => projects.findOneAndUpdate(
      { _id: id, 'tasks._id': taskId },
      { $pull: { tasks: { _id: taskId } }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' },
    ),
  };
}

module.exports = { openMongo, mongoRepo, toId };
