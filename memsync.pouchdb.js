memcouch.slaveToPouch = function (memdb, pouch) {
    /*
        We'd need a lot more logic in memcouch.db to make this *really* work:
        control over revs history and conflict tracking with get/put options.
        
        Relevant links:
        - https://github.com/couchbaselabs/TouchDB-iOS/wiki/Replication-Algorithm
        - http://wiki.apache.org/couchdb/Replication_and_conflicts
        
        What this does is blithely assume a standalone master-slave type relationship.
    */
    
    var status = {changesPending:0},
        ignoreOwnChange = false;
    pouch.changes({continuous:true, include_docs:true, onChange: function (change) {
        var memdoc = memdb.get(change.id);
        if (!memdoc || memdoc._rev !== change.doc._rev) {
            ignoreOwnChange = true;
            memdb.put(change.doc);
            ignoreOwnChange = false;
        }
    }});
    memdb.watch(function (change) {
        if (ignoreOwnChange) return;
        status.changesPending += 1;
        var _dbseq = change.doc._dbseq;
        delete change.doc._dbseq;
        pouch.put(change.doc, function (e, d) {
            status.changesPending -= 1;
            /* NOTE: we simply don't handle errors here, choosing instead to close our eyes and
               pretend that errors are _always_ due to remote changes we will be getting soon! */
            if (!e) change.doc._rev = d.rev;
        });
        change.doc._dbseq = _dbseq;
    });
    return status;
};