var mongodb = require('mongodb');

var log = require('./log.js')('dataBroker.js');

module.exports = function(config){
  var mongoClient = null;

  return {
    getDataStream: function(streamId, cb) {
      if (mongoClient == null) {
        return cb({ message: 'Must start the dataBroker before using it.' });
      }

      mongoClient.collection('deviceData', function(err, collection) {
        if (err != null) {
          return cb(err);
        }

        collection
          .find({ groupId: streamId })
          .sort('deviceTime', 'asc')
          .toArray(
          function(error, results){
            if (error != null) {
              return cb(error);
            }
            return cb(null, results);
          });
      });
    },

    start: function(cb){
      if (mongoClient != null) {
        return;
      }

      if (cb == null) {
        cb = function(err) {
          if (err != null) {
            log.warn(err, 'Error connection to mongo!');
            return;
          }
          log.info('Successfully connected to mongo');
        }
      }

      mongodb.MongoClient.connect(config.mongoConnectionString, function(err, db){
        if (db != null) {
          if (mongoClient != null) {
            db.close();
            return;
          }
          mongoClient = db;
        }

        cb(err);
      });
    },
    close: function() {
      if (mongoClient != null) {
        mongoClient.close();
        mongoClient = null;
      }
    }
  }
};