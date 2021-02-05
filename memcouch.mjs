const EDIT_SEQ = Symbol("memcouch.internal._edit_seq");
const CONFLICT = Symbol.for('memcouch._conflict');

class Memcouch {
  constructor() {
    // NOTE: these are ± public API
    //       mapping _id -> full doc [or null]
    this.sourceDocs = new Map();
    this.editedDocs = new Map();
    
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
        if (edoc._deleted && this.sourceDocs.get(edoc._id) === null) {
          continue;   // source doesn't need to know about this one
        }
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
        yield doc;
      }
    }
  }
  
  get allDocs() {
    return this._generateDocs();
  }
  
  // "the user would like `doc` to be its future state"
  // NOTE: `doc._rev` will be modified in-place
  //      (as well as [CONFLICT] and [EDIT_SEQ])
  edit(doc) {
    let id = doc._id;
    if (!this.sourceDocs.has(id)) {
      // this keeps `_generateDocs` simpler
      this.sourceDocs.set(id, null);
    }
    this._setEditSequence(doc);
    this.editedDocs.set(id, doc);
  }
  
  // "the source considers `doc` to be its current state"
  update(doc) {
    let id = doc._id;
    this.sourceDocs.set(id, doc);
    
    // note (probable) conflict on locally-edited doc
    let edoc = this.editedDocs.get(id);
    if (edoc && edoc._rev !== doc._rev) {
      edoc[CONFLICT] = doc;
    }
  }
  
  // "the edits to ${id} as of ${tok} have been accepted by the source as ${rev}"
  updateFromEdit(id, tok=this.currentEditToken, rev=null) {
    let seq = this._editSequence.get(tok),
        edoc = this.editedDocs.get(id),
        sdoc = this.sourceDocs.get(id);
    
    // in either of the cases below,
    // the updated _rev is the best.
    if (rev !== null) {
      edoc._rev = rev;
    }
    
    if (edoc[EDIT_SEQ] <= seq) {
      // "store" the edits as-saved
      delete edoc[EDIT_SEQ];
      delete edoc[CONFLICT];
      this.sourceDocs.set(id, edoc);
      this.editedDocs.delete(id);
    } else {
      // there have been further edits, don't discard them!
      if (sdoc === null) {
        // some earlier version of edoc has been stored, so now
        // if the doc is locally deleted we must show as edited.
        this.sourceDocs.set(id, {_id:id});
      }
    }
  }
}

export {Memcouch as default, CONFLICT};
