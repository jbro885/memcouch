
const NEXT_UPDATE = Symbol("Represents whatever _rev the next update has.");
const EDIT_SEQ = Symbol("_edit_seq");
const CONFLICT = Symbol.for('memcouch._conflict');

class Memcouch {
  constructor() {
    // NOTE: these are ± public API
    //       mapping _id -> full doc [or null]
    this.sourceDocs = new Map();
    this.editedDocs = new Map();
    
    this._expectedUpdates = new Map();
    this._likelyConflicts = new Set();
    
    this._editSequence = new WeakMap();
    this._editSequence.current = -1;
    this._currentEditToken = this._generateNextEditToken();
  }
  
  _generateNextEditToken() {
    let tok = Object.create(null);
    this._editSequence.set(tok, this._editSequence.current++);
    return tok;
  }
  
  get currentEditToken() {
    return this._currentEditToken;
  }
  
  _setEditSequence(doc) {
    doc[EDIT_SEQ] = this._editSequence.current;
    this._currentEditToken = this._generateNextEditToken();
  }
  
  * _generateEditsSince(tok) {
    let seq = (tok !== null) ?
      this._editSequence.get(tok) : -1;
    for (let edoc of this.editedDocs.values()) {
      if (edoc[EDIT_SEQ] > seq) {
        yield edoc;
      }
    }
  }
  
  localEditsSinceToken(tok) {
    return this._generateEditsSince(tok);
  }
  
  get localEdits() {
    return this._generateEditsSince(null);
  }
  
  * _generateDocs() {
    for (let [id, sdoc] of this.sourceDocs) {
      let doc = (this.editedDocs.has(id)) ?
        this.editedDocs.get(id) : sdoc;
      if (doc && !doc._deleted) {
        if (this._likelyConflicts.has(id)) {
          doc[CONFLICT] = sdoc;
        }
        yield doc;
      }
    }
  }
  
  get allDocs() {
    return this._generateDocs();
  }
  
  edit(doc) {
    // NOTE: doc will be modified in-place (to add an _edit_seq and 
    
    let id = doc._id;
    if (!this.sourceDocs.has(id)) {
      // this keeps `_generateDocs` simpler
      this.sourceDocs.set(id, null);
    }
    this._setEditSequence(doc);
    this.editedDocs.set(id, doc);
    if (this._expectedUpdates.has(id)) {
      // we don't want to lose this new edit
      this._expectedUpdates.delete(id);
      // TODO: however, it also means that the next update is unlikely to be a real conflict :-/
    }
  }
  
  update(doc) {
    let id = doc._id;
    this.sourceDocs.set(id, doc);
    this._maybeCleanup(id, 'update()');
    if (this.editedDocs.has(id)) {
      this._likelyConflicts.add(id);
    }
  }
  
  _cleanup(id) {
    this.editedDocs.delete(id);
    this._likelyConflicts.delete(id);
    this._expectedUpdates.delete(id);
  }
  
  _maybeCleanup(id, caller) {
    let updateExpected = this._expectedUpdates.has(id);
    if (!updateExpected) {
      return;
    }
    
    let expectedRev = this._expectedUpdates.get(id);
    if (expectedRev === NEXT_UPDATE) {
      this._cleanup(id);
    } else {
      let sourceDoc = this.sourceDocs.get(id);
      // NOTE: `sourceDoc` may be null when we `expectUpdate` on new doc
      if (sourceDoc && sourceDoc._rev === expectedRev) {
        this._cleanup(id);
      } else if (caller === 'update()') {
        console.warn("Document was updated, but with an unexpected revision.");
        // NOTE: this can happen if doc changes faster than _changes is polled
        // TODO: should we cleanup anyway?
      }
    }
  }
  
  // call this after save to update the rev of source version
  assumeUpdate(id, rev=null) {
    let doc = this.editedDocs.get(id);
    if (rev === null) {
      this.expectUpdate(id);
    } else {
      this.expectUpdate(id, rev);
      doc._rev = rev;
    }
    // discard local fields if present
    delete doc[EDIT_SEQ];
    delete doc[CONFLICT];
    this.update(doc);
  }
  
  // call this when local edit has been saved BUT you're relying
  // on e.g. _changes?include_docs=true feed for the source state.
  // NOTE: use `rev=NEXT_UPDATE` only when calling `update` directly afterwards!
  expectUpdate(id, rev=NEXT_UPDATE) {
    this._expectedUpdates.set(id, rev);
    if (rev !== NEXT_UPDATE) {
      // changes could come through before
      // the response with saved _rev does.
      this._maybeCleanup(id, 'expectUpdate()');
    }
  }
  
}

export {Memcouch as default, CONFLICT};

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