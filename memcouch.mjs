
const NEXT_UPDATE = Symbol("Represents whatever _rev the next update has.");
const EDIT_SEQ = Symbol("memcouch.internal._edit_seq");
const CONFLICT = Symbol.for('memcouch._conflict');

// how many times will we allow unexpected updates before un-expecting them?
const MAX_UNEXPECTED_UPDATES = 3;

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
  }
  
  update(doc) {
    let id = doc._id;
    this.sourceDocs.set(id, doc);
    this._maybeCleanup(id, 'update()');
    this._maybeConflict(id);
  }
  
  _maybeConflict(id) {
    if (this.editedDocs.has(id)) {
      this._likelyConflicts.add(id);
    }
  }
  
  _cleanup(id, dropEdit=true) {
    this._expectedUpdates.delete(id);
    if (dropEdit) {
      this.editedDocs.delete(id);
      this._likelyConflicts.delete(id);
    } else {
      // TODO: prevent FUTURE conflict?? [via _rev?]
    }
  }
  
  _maybeCleanup(id, caller) {
    let updateExpected = this._expectedUpdates.has(id);
    if (!updateExpected) {
      return;
    }
    
    let editedDoc = this.editedDocs.get(id),
        updateObj = this._expectedUpdates.get(id);
    let {rev:expectedRev,doc:editSnapshot} = updateObj;
    if (expectedRev === NEXT_UPDATE) {
      this._cleanup(id, editedDoc === editSnapshot);
    } else {
      let sourceDoc = this.sourceDocs.get(id);
      // NOTE: `sourceDoc` may be null when we `expectUpdate` on new doc
      if (sourceDoc && sourceDoc._rev === expectedRev) {
        this._cleanup(id, editedDoc === editSnapshot);
      } else if (caller === 'update()') {
        console.warn("Document was updated, but with an unexpected revision.");
        // NOTE: this can happen if doc changes faster than _changes is polled
        //       (or e.g. if even older changes are still rolling in as well…!)
        if (++updateObj.ctr > MAX_UNEXPECTED_UPDATES) {
          // ~HACK: give up eventually (preserving local edits just in case)
          this._cleanup(id, false);
        }
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
    let doc = this.editedDocs.get(id);
    this._expectedUpdates.set(id, {rev,doc,ctr:0});
    if (rev !== NEXT_UPDATE) {
      // changes could come through before
      // the response with saved _rev does.
      this._maybeCleanup(id, 'expectUpdate()');
    }
  }
  
}

export {Memcouch as default, CONFLICT};
