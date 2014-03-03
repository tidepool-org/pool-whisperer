/*
 * == BSD2 LICENSE ==
 */

var rx = require('rx');


/**
 * A self-join is a join operation done on a single stream of objects.
 *
 * The idea is basically to run through all events and check if any "builders" know how to handle them.
 * If a builder does know how to handle it, it gives us a "handler" that we can use to join together those
 * events.
 *
 * If we have a handler, we delegate all events to it. Once the handler returns an array of events to emit,
 * then those events are emitted and the handler is cleared
 *
 * @param eventStream an Observable to have its bolus events self-joined.
 */
module.exports = function(eventStream, builderFns) {
  var handler = null;

  return rx.Observable.create(
    function (obs) {
      function processEvent(e) {
        if (handler == null) {
          for (var i = 0; i < builderFns.length && handler == null; ++i) {
            handler = builderFns[i](e);
          }
        }

        if (handler == null) {
          obs.onNext(e);
        } else {
          var results;
          try {
            results = handler.handle(e);
          } catch (err) {
            obs.onError(err);
          }

          if (results != null) {
            handler = null;
            results.forEach(processEvent);
          }
        }
      }

      eventStream.subscribe(
        processEvent,
        function (err) {
          obs.onError(err);
        },
        function () {
          if (handler != null) {
            var handlerRef = handler;
            handler = null;
            handlerRef.completed().forEach(obs.onNext.bind(obs));
          }
          obs.onCompleted();
        }
      );
    }
  );
};