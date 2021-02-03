
class Memcouch {
  constructor() {
    // NOTE: these are ± public API
    //       mapping _id -> full doc [or null]
    this.sourceDocs = new Map();
    this.editedDocs = new Map();
    
    this._expectedUpdates = new Map();
    this._currentEditToken = this._nextEditToken;
  }
  
  get _nextEditToken() {
    let tok = Object.create(null);
    //tok._seq = this.__debugSequence || 0;
    //this.__debugSequence = tok._seq + 1;
    return tok;
  }
  
  get currentEditToken() {
    return this._currentEditToken;
  }
  
  localEdits(since=null) {
    // TODO
  }
  
  *_generateDocs() {
    for (let [id, sdoc] of this.sourceDocs) {
      let doc = (this.editedDocs.has(id)) ?
        this.editedDocs.get(id) : sdoc;
      if (doc && !doc._deleted) {
        yield doc;
      }
    }
  }
  
  get allDocs() {
    return this._generateDocs();
  }
  
  set(doc) {
    let id = doc._id;
    if (!this.sourceDocs.has(id)) {
      // this keeps `*_generateDocs` simpler
      this.sourceDocs.set(id, null);
    }
    this.editedDocs.set(id, doc);
  }
  
  update(doc) {
    this.sourceDocs.set(doc._id, doc);
    // TODO: remove local if update expected, or mark conflict, etc.
  }
  
  expectUpdate(id, rev) {
    // TODO
  }
  
}

export default Memcouch;

/*

db.currentUpdateToken
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
*/