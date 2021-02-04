import { strict as assert } from 'assert';

import Memcouch from "./memcouch.mjs";

let db = new Memcouch();
let arr, doc, tok;    // reused below

arr = Array.from(db.allDocs);
assert.equal(arr.length, 0, "How could there be docs even??");

db.update(doc = {_id:'A', _rev:1, value:0});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should contain one doc.");
assert.equal(arr[0], doc, "Doc should have original identity.");

db.edit(doc = {_id:'A', _rev:1, value:1});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should still contain only one document.");
assert.notEqual(arr[0].value, 0, "Doc should NOT have original content.");
assert.equal(arr[0], doc, "Should contain new document object.");

db.update({_id:'A', _rev:2, value:42});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 1, "Should STILL contain only one document.");
assert.equal(arr[0], doc, "Should still expose locally-edited doc.");

db.expectUpdate('A', 3);
arr = Array.from(db.allDocs);
assert.equal(arr[0], doc, "The locally-edited content should abides.");
db.update(doc = {_id:'A', _rev:3, value:43});
arr = Array.from(db.allDocs);
assert.equal(arr[0], doc, "The remote content should prevail now.");
assert.equal(arr.length, 1, "And still only one document.");

db.edit({_id:'A', _rev:3, value:50});
db.update(doc = {_id:'A', _rev:4, value:44});
arr = Array.from(db.allDocs);
assert.equal(arr[0]._conflict, doc, "Sequence should result in a conflict…");
assert.equal(arr[0].value, 50, "…but the local content should be used.");

tok = db.currentEditToken;
db.edit(doc = {_id:'B', value:true});
arr = Array.from(db.allDocs);
assert.equal(arr.length, 2, "Should now contain two documents.");
arr = Array.from(db.localEdits);
assert.equal(arr.length, 2, "Should see two outstanding local edits.");
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 1, "Should only see one edit relative to checkpoint.");

tok = db.currentEditToken;
db.update({_id:'C', isFor:"cookies"});
assert.equal(db.currentEditToken, tok, "Edit token only changes on edits, not updates.");
db.edit(doc = {_id:'C', isFor:"shanties"});
arr = Array.from(db.localEditsSinceToken(tok));
assert.equal(arr.length, 1, "Should again see just one edit relative to new checkpoint.");
assert.equal(arr[0], doc, "The edit should be the expected one");

console.log("which tests that do exist, they did all pass.");
