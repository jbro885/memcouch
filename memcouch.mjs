
class CoreDatabase {
  constructor() {
    // NOTE: these are ± public API
    //       mapping _id -> full doc
    this.sourceDocs = new Map();
    this.editedDocs = new Map();
  }
  
  updateSource(doc) {
    this.sourceDocs.set(doc._id, doc);
  }
  
  updateEdited(doc) {
    this.editedDocs.set(doc._id, doc);
  }
  
  // source docs must leave behind _deleted tombstones,
  // but edited docs can go away after they're stored
  removeEdited(doc) {
    this.editedDocs.delete(doc._id);
  }
}

class Memcouch {
  constructor() {
    this._db = new CoreDatabase();
  }
  
  get(id) {
    return (
      this._db.editedDocs[id] ||
      this._db.storedDocs[id] ||
      null
    );
  }
  
  put(doc) {
    this._db.updateEdited(doc);
  }
  
  sync(doc) {}
}

db.updateToken
db.editsSince(tok=null)
let unwatch = db.watch(() => {});

db.allDocs
db.edit(doc)    // i.e. local change
db.update(doc)  // i.e. sync w/source
xdb.clearUntil(id,tok)  // [when stored… but this will lead to flashback of content until synced!]
xdb.clearOnUpdate(id)   // [when stored… will need to unset this if document set afterwards though…]
db.expectUpdate(id,rev) // [note: changes feed may skip this rev so some sort of backup strategy needed]


// how to know if update replaces in-memory override?
// IDEA: after successful save, update the local _rev [in-place]?
//       then on `update`, forget edited doc if it has rev of change?
//       CAUTION: if doc rapidly changes then may never see the successful save… :-/
//          IDEA: just mark the saved version for removal on next update to that _id?

// TODO: track 3 versions (loaded/synced/edited) or only source/edited?
//    A: not worth tracking loaded version (± only applied to "main" doc in orig use case anyway)

// update({_id:'A', _rev:1, value:0})
// set({_id:'A', _rev:1, value:1})
// set({_id:'A', _rev:1, value:2})
// update({_id:'A', _rev:2, value:42})
// set({_id:'A', _rev:1, value:3})


// EXPECTATIONS:
// local edits will maintain _rev of its source
// saved edits will expectUpdate(id, _rev) from response
// [if unexpected change to id happens, warn but de-conflict?]
//   stored= _rev of update doc matches [expected] _rev of edited
// conflict= _rev of edited doc does not match _rev of source doc
// if no _rev, assume no conflict (i.e. last-save-wins update…)
