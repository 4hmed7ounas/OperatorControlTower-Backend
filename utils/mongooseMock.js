import mongoose from "mongoose";

const originalConnect = mongoose.connect;
const originalModel = mongoose.model;

// In-memory data store for Mongoose collections
const mockStore = {
  User: [],
  Vehicle: [],
  Booking: [],
  Alert: [],
  ActionLog: [],
};

// Tracks if we are running in mock database mode
global.useMockDb = false;

// Helper to generate a mock ObjectId
function generateId() {
  return new mongoose.Types.ObjectId().toString();
}

// Intercept connection and set global fallback if it fails
mongoose.connect = async function (uri, options) {
  try {
    if (process.env.USE_MOCK_DB === "true") {
      throw new Error("Forced USE_MOCK_DB config");
    }
    const conn = await originalConnect.call(mongoose, uri, options);
    console.log("Successfully connected to real MongoDB.");
    return conn;
  } catch (error) {
    console.warn(
      `\n⚠️ MongoDB connection failed (${error.message}).\n🚀 Falling back to In-Memory Mock Database mode. Data will persist in memory.\n`
    );
    global.useMockDb = true;
    return mongoose.connection; // return mock connection state
  }
};

/**
 * Helper to populate referenced fields (e.g. vehicleId in Booking)
 */
function populateDoc(doc, path, collectionName) {
  if (!doc) return doc;
  
  // Clone doc to avoid mutating original store record directly
  const cloned = JSON.parse(JSON.stringify(doc));

  if (path === "vehicleId" && cloned.vehicleId) {
    const vehicleIdStr = cloned.vehicleId.toString();
    const vehicle = mockStore.Vehicle.find(v => v._id.toString() === vehicleIdStr);
    if (vehicle) {
      cloned.vehicleId = JSON.parse(JSON.stringify(vehicle));
    }
  }
  return cloned;
}

/**
 * Mock Query Builder supporting populate, sort, and thenable
 */
class MockQuery {
  constructor(result, modelName) {
    this.result = result;
    this.modelName = modelName;
  }

  populate(path) {
    if (Array.isArray(this.result)) {
      this.result = this.result.map(doc => populateDoc(doc, path, this.modelName));
    } else if (this.result) {
      this.result = populateDoc(this.result, path, this.modelName);
    }
    return this;
  }

  sort(criteria) {
    if (Array.isArray(this.result) && criteria) {
      const field = Object.keys(criteria)[0];
      const direction = criteria[field]; // 1 or -1
      
      this.result.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];
        
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
      });
    }
    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.result).then(onFulfilled, onRejected);
  }
}

// Intercept model compilation to wrap database access methods
mongoose.model = function (name, schema) {
  const modelClass = originalModel.call(mongoose, name, schema);

  // Initialize store array for this collection
  if (!mockStore[name]) {
    mockStore[name] = [];
  }

  const originalSave = modelClass.prototype.save;
  const originalFind = modelClass.find;
  const originalFindOne = modelClass.findOne;
  const originalFindById = modelClass.findById;
  const originalCreate = modelClass.create;
  const originalFindByIdAndUpdate = modelClass.findByIdAndUpdate;
  const originalFindByIdAndDelete = modelClass.findByIdAndDelete;
  const originalDeleteMany = modelClass.deleteMany;
  const originalUpdateMany = modelClass.updateMany;

  // Wrap Save instance method
  modelClass.prototype.save = async function () {
    if (global.useMockDb) {
      const store = mockStore[name];
      
      if (!this._id) {
        this._id = generateId();
      }
      
      // Simulate update-hooks or pre-save updates
      if (name === "Vehicle") {
        this.updatedAt = new Date();
      }

      // Mongoose converts documents to plain objects for JSON response
      const docObj = this.toObject();
      docObj._id = this._id.toString();

      const idx = store.findIndex(d => d._id.toString() === docObj._id.toString());
      if (idx >= 0) {
        store[idx] = docObj;
      } else {
        store.push(docObj);
      }
      return this;
    }
    return await originalSave.apply(this);
  };

  // Wrap find class method
  modelClass.find = function (query = {}) {
    if (global.useMockDb) {
      let results = [...mockStore[name]];
      
      // Basic query filtering
      if (query && Object.keys(query).length > 0) {
        results = results.filter(doc => {
          for (const key of Object.keys(query)) {
            const queryVal = query[key];
            
            // Handle basic key value matching
            if (queryVal && typeof queryVal === "object") {
              if (queryVal.$ne !== undefined && doc[key] === queryVal.$ne) return false;
              if (queryVal.$lt !== undefined && new Date(doc[key]) >= new Date(queryVal.$lt)) return false;
              if (queryVal.$gte !== undefined && new Date(doc[key]) < new Date(queryVal.$gte)) return false;
            } else if (doc[key] !== queryVal) {
              return false;
            }
          }
          return true;
        });
      }
      return new MockQuery(results, name);
    }
    return originalFind.apply(this, arguments);
  };

  // Wrap findOne class method
  modelClass.findOne = function (query = {}) {
    if (global.useMockDb) {
      const results = modelClass.find(query).result;
      const first = results.length > 0 ? results[0] : null;
      return new MockQuery(first, name);
    }
    return originalFindOne.apply(this, arguments);
  };

  // Wrap findById class method
  modelClass.findById = function (id) {
    if (global.useMockDb) {
      if (!id) return new MockQuery(null, name);
      const idStr = id.toString();
      const doc = mockStore[name].find(d => d._id.toString() === idStr);
      return new MockQuery(doc || null, name);
    }
    return originalFindById.apply(this, arguments);
  };

  // Wrap create class method
  modelClass.create = async function (data) {
    if (global.useMockDb) {
      const items = Array.isArray(data) ? data : [data];
      const createdItems = [];

      for (const item of items) {
        const doc = new modelClass(item);
        await doc.save();
        createdItems.push(doc);
      }

      return Array.isArray(data) ? createdItems : createdItems[0];
    }
    return await originalCreate.apply(this, arguments);
  };

  // Wrap findByIdAndUpdate class method
  modelClass.findByIdAndUpdate = async function (id, update, options = {}) {
    if (global.useMockDb) {
      const idStr = id ? id.toString() : "";
      const docIdx = mockStore[name].findIndex(d => d._id.toString() === idStr);
      
      if (docIdx === -1) return null;

      const doc = mockStore[name][docIdx];
      
      // Perform updates
      let updatedFields = update;
      if (update.$set) updatedFields = update.$set;
      
      const newDoc = {
        ...doc,
        ...updatedFields,
        _id: idStr,
      };

      mockStore[name][docIdx] = newDoc;

      // Wrap in document instance so save and other methods work
      const docInstance = new modelClass(newDoc);
      return docInstance;
    }
    return originalFindByIdAndUpdate.apply(this, arguments);
  };

  // Wrap findByIdAndDelete class method
  modelClass.findByIdAndDelete = async function (id) {
    if (global.useMockDb) {
      const idStr = id ? id.toString() : "";
      const docIdx = mockStore[name].findIndex(d => d._id.toString() === idStr);
      
      if (docIdx === -1) return null;

      const doc = mockStore[name][docIdx];
      mockStore[name].splice(docIdx, 1);
      return doc;
    }
    return originalFindByIdAndDelete.apply(this, arguments);
  };

  // Wrap deleteMany class method
  modelClass.deleteMany = async function (query = {}) {
    if (global.useMockDb) {
      mockStore[name] = [];
      return { deletedCount: mockStore[name].length };
    }
    return originalDeleteMany.apply(this, arguments);
  };

  // Wrap updateMany class method
  modelClass.updateMany = async function (query = {}, update = {}) {
    if (global.useMockDb) {
      const results = modelClass.find(query).result;
      let updatedFields = update;
      if (update.$set) updatedFields = update.$set;

      for (const doc of results) {
        const docIdx = mockStore[name].findIndex(d => d._id.toString() === doc._id.toString());
        if (docIdx !== -1) {
          mockStore[name][docIdx] = {
            ...mockStore[name][docIdx],
            ...updatedFields,
          };
        }
      }
      return { modifiedCount: results.length };
    }
    return originalUpdateMany.apply(this, arguments);
  };

  return modelClass;
};

export default mongoose;
export { mockStore };
