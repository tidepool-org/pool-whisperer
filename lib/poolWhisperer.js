/*
 == BSD2 LICENSE ==
 Copyright (c) 2014, Tidepool Project

 This program is free software; you can redistribute it and/or modify it under
 the terms of the associated License, which is identical to the BSD 2-Clause
 License as published by the Open Source Initiative at opensource.org.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE. See the License for more details.

 You should have received a copy of the License along with this program; if
 not, you can obtain one from Tidepool Project at tidepool.org.
 == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var async = require('async');
var restify = require('restify');
var rx = require('rx');

var dataHelpers = require('./tidepool/dataHelpers.js');
var log = require('./log.js')('poolWhisperer.js');

module.exports = function seagullService(userApiClient, seagullClient, accessClient, dataBroker) {
  function createServer(serverConfig) {
    log.info('Creating server[%s]', serverConfig.name);
    var retVal = restify.createServer(serverConfig);
    retVal.use(restify.queryParser());
    retVal.use(restify.bodyParser());
    retVal.use(restify.gzipResponse());

    var userApiMiddleware = require('user-api-client').middleware;
    var checkToken = userApiMiddleware.checkToken(userApiClient);

    //health check
    retVal.get('/status', function(req, res, next){
      res.send(200);
      next();
    });

    // manage the private information
    retVal.get('/:userid', checkToken, function(req, res, next){
      var presentUser = req._tokendata.userid;
      var requestedUser = req.params.userid;

      async.waterfall(
        [
          function(cb) {
            accessClient.canViewData(presentUser, requestedUser, cb);
          },
          function(canView, cb) {
            if (canView) {
              userApiClient.withServerToken(cb);
            } else {
              cb({ statusCode: 401, message: 'You are a Balrog and I am Gandalf. EOM'});
            }
          },
          function(token, cb) {
            seagullClient.getPrivatePair(req.params.userid, 'uploads', token, cb);
          }
        ],
        function(err, hashPair) {
          if (err != null) {
            if (err.statusCode === undefined) {
              log.warn(err, 'Failed to get private pair for user[%s]', req._tokendata.userid);
              res.send(500);
            } else {
              res.send(err.statusCode, err.message);
            }
            return;
          }

          if (hashPair == null) {
            log.warn('Unable to get hashPair, something is broken...');
            res.send(503);
            return;
          }

          var dataStreamId = hashPair.id;

          dataBroker.getDataStream(dataStreamId, function(err, stream){
            if (err != null) {
              log.warn(err, 'Failure loading data stream user[%s] to be viewed by user[%s]', requestedUser, presentUser);
              res.send(500);
              next();
              return;
            }

            var headWritten = false;
            stream
              .on('data',
                  function(data){
                    if (!headWritten) {
                      res.writeHead(
                        200,
                        {
                          'Content-Type': 'application/json'
                        }
                      );
                      res.write('[');
                      headWritten = true;
                    } else {
                      res.write(',\n');
                    }

                    res.write(JSON.stringify(data));
                  })
              .on('error',
                  function(err){
                    log.warn(err, 'Failure loading data stream user[%s] to be viewed by user[%s]', requestedUser, presentUser);
                    res.send(500);
                    next();
                  })
              .on('end',
                  function(){
                    if (!headWritten) {
                      return res.send(404);
                    } else {
                      res.write('\n]\n');
                      res.end();
                    }
                  });
            next();
          });
        }
      );
    });

    retVal.on('uncaughtException', function(req, res, route, err){
      log.error(err, 'Uncaught exception on route[%s]!', route.spec ? route.spec.path : 'unknown');
      res.send(500);
    });

    return retVal;
  }

  var objectsToManage = [];
  return {
    withHttp: function(port, cb){
      var server = createServer({ name: 'PoolWhispererHttp' });
      objectsToManage.push(
        {
          start: function(){
            server.listen(port, function(err){
              if (err == null) {
                log.info('Http server listening on port[%s]', port);
              }
              if (cb != null) {
                cb(err)
              }
            });
          },
          close: server.close.bind(server)
        }
      );
      return this;
    },
    withHttps: function(port, config, cb){
      var server = createServer(_.extend({ name: 'PoolWhispererHttps' }, config));
      objectsToManage.push(
        {
          start: function(){
            server.listen(port, function(err){
              if (err == null) {
                log.info('Https server listening on port[%s]', port);
              }
              if (cb != null) {
                cb(err)
              }
            });
          },
          close: server.close.bind(server)
        }
      );
      return this;
    },
    start: function() {
      if (objectsToManage.length < 1) {
        throw except.ISE("Pool Whisperer must listen on a port to be useful, specify http, https or both.");
      }

      objectsToManage.forEach(function(obj){ obj.start(); });
      return this;
    },
    close: function() {
      objectsToManage.forEach(function(obj){ obj.close(); });
      return this;
    }
  };
};