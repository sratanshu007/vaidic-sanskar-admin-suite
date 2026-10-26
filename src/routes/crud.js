const express = require('express');
const store = require('../store');

/**
 * Generic REST router for a store collection. Mounted by the admin router for
 * every resource, so the admin panel's list/update/create/delete work with
 * zero bespoke code.
 *   GET    /           list (?q= search, ?field=&value= filter)
 *   GET    /:id        one
 *   POST   /           create
 *   PATCH  /:id        update
 *   DELETE /:id        delete
 */
module.exports = function crudRouter(collection) {
  const r = express.Router();
  r.get('/', (req, res) => res.json({ data: store.list(collection, req.query) }));
  r.get('/:id', (req, res) => {
    const row = store.get(collection, req.params.id);
    row ? res.json(row) : res.status(404).json({ message: 'Not found' });
  });
  r.post('/', (req, res) => {
    const row = store.insert(collection, req.body || {});
    if (collection === 'products') {
      try {
        const { emit } = require('../sockets');
        emit.broadcast('store:products_updated', { action: 'create', product: row });
      } catch (_) {}
    }
    res.status(201).json(row);
  });
  r.patch('/:id', (req, res) => {
    const row = store.update(collection, req.params.id, req.body || {});
    if (row && collection === 'vendors') {
      try {
        const { emit } = require('../sockets');
        emit.toVendor(row.id, 'vendor:update', row);
        emit.toVendor(row.id, 'vendor:status', row);
        if (row.kyc === 'Verified' || row.status === 'Active') {
          emit.toVendor(row.id, 'kyc:approved', row);
        }
        emit.toAdmin('vendor:update', row);
        emit.broadcast('vendor:update', row);
        emit.broadcast('vendor:status', row);
      } catch (_) {}
    }
    if (row && collection === 'products') {
      try {
        const { emit } = require('../sockets');
        emit.broadcast('store:products_updated', { action: 'update', product: row });
      } catch (_) {}
    }
    row ? res.json(row) : res.status(404).json({ message: 'Not found' });
  });
  r.delete('/:id', (req, res) => {
    const deleted = store.remove(collection, req.params.id);
    if (deleted && collection === 'products') {
      try {
        const { emit } = require('../sockets');
        emit.broadcast('store:products_updated', { action: 'delete', id: req.params.id });
      } catch (_) {}
    }
    deleted ? res.json({ deleted: true }) : res.status(404).json({ message: 'Not found' });
  });
  return r;
};
