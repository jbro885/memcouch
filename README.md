# memcouch

Assuming a CouchDB dataset small enough to replicate to the client, why not simply keep it in memory?

Memcouch is designed to bridge the gap between the "we need something on the screen" user interface practicalities, and the "asynchronous, eventually consistent" details of data storage.

Your editing UI logic gets the direct primitives it needs for immediate read and write access to local state, and your autosaving API logic gets the tools it needs to determine what needs saving and what doesn't. Memcouch does the bookkeeping as each document is changed locally and/or remotely.

Key concepts:

* Memcouch is intended to work in conjunction with a source database, and facilitate syncing `localEdits` *to* this source while handling any `update`s *from* this source.
* a basic familiarity with [CouchDB](https://docs.couchdb.org/en/latest/intro/overview.html#document-storage) or [PouchDB](https://pouchdb.com/guides/documents.html)'s document storage model and replication features is assumed
* in particular, Memcouch `doc`ument objects must always have an `_id`, and should have a `_rev` field once they are tracked by the source
* all documents may be edited (even created or `_delete:true`-ed) locally at any time
* all documents may be changed (/created/removed) remotely at any time too
* your UI and/or API logic will need *some* support for conflict handling


## Example usage

While intended for use with an in-browser UI framework (such as Preact) and a more permanent storage source (such as PouchDB), Memcouch can be used without any inherent depedencies:

    import Database from 'memcouch';
    
    let db = new Database();
    
    db.edit({_id:'my_number', value:1});
    db.edit({_id:'msg123456', type:'message', content:"Hi there."});
    
    console.log([...db.allDocs]);
    // [{_id:'my_number', …}, {_id:'msg123456', …}]
    
    db.update({
      "_id": "remotely_added",
      "_rev": "3-ab5ync3d",
      "source": "you can watch for remote changes",
      "note": "this document will NOT be included in the first set of localEdits below"
    });
    
    let checkpoint = db.currentEditToken;
    for (let doc of db.localEdits) {
      storeRemotely(doc).then((dbRev) => {
        db.updateFromEdit(doc._id, checkpoint, dbRev);
      });
    }
    
    db.subscribe(() => {
      console.log("Data (or its status) changed, you could update UI in response…");
    });
    
    db.edit({_id:'my_number', value:2});
    db.edit({_id:'remotely_added', _rev:"3-ab5ync3d", overwritten:true});
    
    // regardless of when the `storeRemotely` calls complete, the database
    // instance lets you iterate over relevant changes since a `checkpoint`.
    
    setTimeout(() => {
      let unstoredEdits = Array.from(
        db.localEditsSinceToken(checkpoint)
      );
      console.log(unstoredEdits);
      /* [
        {_id:'my_number', _rev: …if available…, value:2},
        {_id:'remotely_added', _rev:"3-ab5ync3d", overwritten:true}
      ] */
    }, 5e3 * Math.random())

[TODO: show a more "real world" integration too, e.g. Preact+PouchDB…]


## API Documentation

Memcouch provides a modern (but sychronous) API over an in-memory collection of documents:

* `let db = new Memcouch()` — creates an empty in-memory document collection
* `db.edit(doc)` — records a change that the user has made to a new/existing document
* `db.update(doc)` — records a change that has been made remotely (may introduce a conflict if already edited locally)
* `db.allDocs` — this is an iterator (n.b. not an `Array`!) over all known documents regardless of source; local edits are preferred over remote updates
* `db.localEdits` — iterator over all documents which have been edited locally but are not yet (known to be) stored remotely
* `let checkpoint = db.currentEditToken` — opaque object representing a particular checkpoint relative to local edits
* `db.localEditsSinceToken(checkpoint)` — returns an iterator over documents which have been edited since `checkpoint`
* `db.updateFromEdit(id, tok, rev)` — informs the database that edits to `id` have been saved and assigned `rev` by the remote source. If the document has been edited since the checkpoint represented by `tok`, the local `_rev` will be updated (in-place) but those edits will be preserved; otherwise the document will no longer be listed as edited (since the "official copy" is now the source copy).
* `let unsubscribe = db.subscribe(watchFn)` — registers `watchFn` to be called whenever the data (or its status) changes. Returns an `unsubscribe` callback which can be used to undo this subscription.

The `doc` objects you provide to Memcouch are treated in a sort of immutable fashion, in that you are expected to make all data changes via the `.edit()`, `.update()`, and `.updateFromEdit()` methods and consult `.allDocs` and `.localEdits` when you need the current state.

However, *in support of* this "immutability" there are several fields that get updated **in place** on edited documents:

* the `_rev` field of the tracked document is modified whenever `updateFromEdit()` is called with a non-`null` revision. By doing so, edits can be saved and expected updates can be incorporated without introducing (undue) conflicts. (In some cases real conflicts are rightly detected, see next point.)
* an entry exposing a potentially conflicting source document will be added to the *edited* version when the `_rev` of a document provided to the `.update()` method does not match the `_rev` of the currently `.edit()`ed version. This entry is keyed by the globally-registered `Symbol.for('memcouch._conflict')`. See the section below for more details.
* an internal-use-only entry for tracking when the document was last edited. The key for this is also a `Symbol` object and should not interfere in most usages (e.g. the entry should be ignored during JSON or IndexedDB serialization). Use the `.currentEditToken` and `.localEditsSinceToken()` interfaces instead of relying on the details of this entry.

Doing these modifications in-place means that the exact object you pass to `db.edit()` will be visible later by `db.allDocs` until your code calls `db.edit()` with a new object. (While not recommended, it *is* okay to *reuse* objects too if your code does not referential equality and you consistently call `db.edit()` immediately after any in-place modifications to those objects.)

The trade-off is that if your code does rely on referential equality e.g. to optimize updates to UI or other derived state **and** if that code considers the `doc._rev` and/or the `doc[Symbol.for('memcouch._conflict')]` fields as signficant for the derived state — this may give you problems. A future version of Memcouch may make this behavior configurable. In the meantime be aware that watchers registered via `db.subscribe()` *will* be triggered on these changes, *but* the documents may have changed in-place. (The iterators returned by `db.allDocs` and `db.localEdits` are always new objects and will never `===` each other even if the database contents have not changed between calls.)

Source documents are never modified in-place by Memcouch. (They may of course be *replaced* by later calls to `.update()` or `.updateFromEdit()`!)


## Revision and conflict tracking details

Memcouch does **not** track the information necessary to fully and properly participate as a [CouchDB replication](https://docs.couchdb.org/en/stable/replication/protocol.html) peer.

Properly, the CouchDB data model is [not a simple key-value store](http://n.exts.ch/2013/07/syncing_couchdb); rather, all peers need to track the entire known "revtree" of a document to determine which revision or revision**s** of a document are in play. Ideally Memcouch would keep track of a per-document graph something like this, as a moderate example:

    _, 1-x, 2-y, 3-z, 4-w, 5-v, 6-deleted
          \ 2-a, 3-a

This example show a conflict introduced after the first stored/calculated revision of the document: one peer generated revision `2-y` while another generated a competing revision `2-a`. At various points in this history and depending on when/how replications were performed, consensus regarding a "winning" revision was eventually reached (and in this case the conflict was also "resolved" by the deletion of one branch after the `5-v` revision).

The Memcouch data model is much simpler. It tracks at most two competing revisions of a document, one based on the most recent `.update()` from the source and the other (optional) revision based on the timing of any local `.edit()` calls:

    source: 2-y
    edited: 2-y with local modification

This could have come about via the sequence:

    // document is loaded from the server
    db.update({_id:'example', _rev:"1-x", data:"[needs content]"});
    
    // we get notified of someone else's change
    db.update({_id:'example', _rev:"2-y", data:"here's an outline, but it needs filling in"});
    
    // we start working locally based on that change
    db.edit({_id:'example', _rev:"2-y", data:"here is some content as we start filling in the outline which someone just provided"});

Now consider what could happen next. Maybe we save the document first:

    import myApi from …;
    
    let checkpoint = db.currentEditToken;
    let results = await myApi.store(db.localEdits);
    for (let {id,rev} of results) {     // [{id:'example', rev:"3-z"}]
      db.updateFromEdit(id, checkpoint, rev);
    }

The internal state for the `_id: 'example'` document in Memcouch would look like:

    source: 3-z
    edited: [no entry]   // local doc got moved to "source" with updated rev

What if someone else saves the document first? From our the local perspective this could proceed as:

    // we've already done the edit above like:
    db.edit({_id:'example', _rev:"2-y", data:…});
    
    // but we might have to handle a callback like:
    myApi.watchChanges((newDoc) => {
      db.update(newDoc);      // {id:'example', rev:"3-yyy"}
    });

In this case, the internal state for the `_id: 'example'` document in Memcouch becomes:

    source: 3-yyy
    edited: 2-y with local modification AND [_conflict] field pointing to source doc

If the local code tries to store its local modifications using now-stale `_rev: "2-y"` token the source will probably reject it. Your app probably needs to resolve the conflict somehow:

    // import { CONFLICT as _conflict } from 'memcouch';
    /* you can use the CONFLICT symbol exported by the library or… */
    const _conflict = Symbol.for('memcouch._conflict');
    
    let conflictedDocs = Array.from(db.localEdits).filter(doc => _conflict in doc);
    conflictedDocs.forEach( (doc) => {
      let {[_conflict]:remoteVersion, ...localVersion} = doc;
      
      // … merge fields or whatever needs to be done to reconcile the two versions …
      // (or, present both versions to the user and proceed only after their input!)
      
      localVersion._rev = remoteVersion._rev;
      db.edit(localVersion);
    });

Once resolved the internal state of the Memcouch instances is once again in a good state to be successfully stored back to the source:

    source: 3-yyy
    edited: 3-yyy with local modification/resolution

The benefit of this simplified approach is that your app only needs to deal with conflicts relative to whichever single revision your source database considers to be the current "winner". The drawbacks are more subtle, including potential edge cases where the app might load a revision `3-z` but later receive an older `2-y` version as it catches up with a slow changes feed. Or the local edits may be equivalent to the source update but because Memcouch does not [calculate deterministic revisions](https://github.com/pouchdb/pouchdb/issues/4642#issuecomment-164209368) — or even assign its own updated revisions to local edits at all — this would still be marked as a conflict. (It might be beneficial to gather the actual revtree information needed for a more sophisticated approach, but the CouchDB `_changes?include_docs=true` feed does not offer an option to annotate its results with the necessary information; a separate request to `{docid}?open_revs=all&revs=true` would be needed on every change!)

So in practice, Memcouch expects:

* local edits will maintain `_rev` of the latest-acknowleged source document which the edits are derived from, i.e. it is your responsibility to include this field in every call to `.edit(…)`
* after you save an edited doc and it has successfully been stored on the source, you will call `.updateFromEdit()` with the checkpoint 


## Semi-public advanced features

These should be considered especially tentative/experimental and a prime candidates for incompatible changes before or between major versions of the library.

Some potentially helpful information provided to the callback passed as e.g. `db.subscribe(watchFn)`:

* when when local edit occurs the database calls `watchFn(id)`
* when a remote update occurs the database calls `watchhFn(id,rev)` *if* the update isn't already shadowed by a non-conflicting local edit
* when a local edit is converted to an assumed update to the database calls `watchFn()`


Also note that there is no `.get(id)` method. This is an intential design choice but should it be necessary, the internal document mappings are currently considered semi-public API:

* `db.sourceDocs` — this is a `Map` from `id` to `doc` of whatever revision has been most recently received from the source
* `db.editedDocs` — this is a `Map` from `id` to `doc` for any local "overrides" of the source documents

If you must use these at all please only use them in a read-only fashion (e.g. `.has` or `.get` methods). 

Common use cases are really intended to be handled through the main API listed in the earlier section of this documentation, e.g. if you need a single document:

    function getDoc(someId) {
      return Array.from(db.allDocs).find(d => d._id === someId);
    }

Or if you need to know if a document is edited:

    function isEdited(doc) {
      return Array.from(db.localEdits).some(d => d === doc);
    }

These may not be the most performant in some cases, but the primary goal of Memcouch is to support only some hundreds or perhaps thousands of local documents that are gathered into derived collections and such by often poorly-memoized [unidirectional data flow](https://reactjs.org/docs/thinking-in-react.html)–styled UI logic anyway. Feedback appreciated.

## BSD License

Copyright © 2021 Nathan Vander Wilt.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
