# memcouch

Assuming a CouchDB dataset small enough to replicate to the client, why not simply keep it in memory?

Access the data with synchronous calls (including a simple "full table scan" style query mechanism) while keeping basic track of changes. Then let some other code handle the "eventual consistency" part in the background — asynchronously replicating\* to something like [PouchDB](http://pouchdb.com) or [CouchDB](http://couchdb.apache.org) in the background.

Key concepts:

 * Memcouch is intended to work in conjunction with a source database, and facilitate syncing `localEdits` *to* this source while handling any `update`s *from* this source.
* documents must always have an `_id`, and should have a `_rev` field once they are tracked by the source
* all documents may be edited (even created or `_delete:true`-ed) locally at any time

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


If needed:

* `Symbol.for('memcouch._conflict')`
* `db.editedDocs`
* `db.sourceDocs`


// EXPECTATIONS:
// local edits will maintain _rev of its source
// saved edits will expectUpdate(id, _rev) from response
// [if unexpected change to id happens, warn but de-conflict?]
//   stored= _rev of update doc matches [expected] _rev of edited
// conflict= _rev of edited doc does not match _rev of source doc
// if no _rev, assume no conflict (i.e. last-save-wins update…)
