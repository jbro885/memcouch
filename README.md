# memcouch

This is an experiment: assuming a CouchDB dataset small enough to replicate to the client, why not simply keep it in memory?

Access the data with synchronous calls (including a simple "full table scan" style query mechanism) while still keeping basic track of changes. Then let some other code handle the "eventual consistency" part in the background — asynchronously replicating\* to something like [PouchDB](http://pouchdb.com) or [CouchDB](http://couchdb.apache.org) in the background.

What could possibly go wrong?


\* Note that it would take not-insignificant more code complexity here to participate in full replication.
Perhaps a more accurate way of describing what memcouch does right now is "slaving", to a single persistent/remote database.


## Example usage

First `<script src="memcouch.js"></script>` or `npm install memcouch` as needed. Here's an example of usage:

    var memcouch = require('memcouch');
    memcouch.slaveToPouch = require('memcouch.pouchdb').slaveToPouch;
    // ^^^ don't use above in browser
    
    var db = memcouch.db();
    db.put({_id:'zero', number:0});
    db.put({_id:'aaaa', number:3});
    db.put({number:2});
    db.put({number:1});
    
    // get all documents, sorted by number (pass `true` or a custom comparator)
    db.query(function (doc) { this.emit(doc.number); }, true);
    
    // array of all long (in this case, autogenerated) document _ids
    var min = 4;
    db.query(function (doc) { if (doc._id.length > min) db.emit(); }).map(function (row) { return row.doc._id; });
    
    var lastSeq = null;
    function watcher(changeResult) {
        lastSeq = changeResult.seq;
        console.log(changeResult.doc._id + " changed!");
    }
    db.watch(watcher);
    var doc = db.get('zero');
    doc.number = Infinity;
    db.put(doc);      // will log
    db.clear(watcher);
    
    doc.number = 0;
    db.put(doc);
    db.since(lastSeq);      // array of one changeResult

    var status = Pouch("idb://metakaolin", function (e, pouch) {
        memcouch.slaveToPouch(model, db);
    });
    window.addEventListener('beforeunload', function (e) {
        if (status.changesPending) return (e.returnValue = "Not all of your changes have been stored yet.");
    }, false);


## TODO

1. Implement default comparison for emitted arrays/objects
1. ???
1. Profit!