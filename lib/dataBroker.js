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

        cb(null, collection.find({ groupId: streamId }).sort('deviceTime', 'asc').stream());
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
          mongoClient.collection('deviceData', function(err, collection){
            if (err == null) {
              collection.ensureIndex({'groupId': 1, 'deviceTime': 1}, {background: true}, function(error, indexName){
                if (error != null) {
                  log.info(error, 'Unable to create index due to error');
                }
                log.info('Index[%s] alive and kicking.', indexName);
              });
            }
          });
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