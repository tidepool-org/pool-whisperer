/*
 * == BSD2 LICENSE ==
 */

var _ = require('lodash');
var moment = require('moment');

var selfJoin = require('../rx/selfJoin.js');

function isScheduledBasal(e) {
  if (e.type.indexOf('basal') >= 0) {
    return e.type === 'basal-rate-change' && e.deliveryType === 'scheduled';
  }
}

function makeNewBasalHandler() {
  var segmentStart = null;
  var eventBuffer = [];
  return {
    completed: function(event) {
      return [
        _.assign(
          {},
          _.omit(segmentStart, 'deviceTime'),
          { type: 'basal-rate-segment',
            start: segmentStart.deviceTime,
            end: null,
            interval: segmentStart.deviceTime + '/' + segmentStart.deviceTime
          }
        )
      ];
    },
    handle: function (event) {
      if (! isScheduledBasal(event)) {
        eventBuffer.push(event);
        return null;
      }

      if (segmentStart == null) {
        segmentStart = event;
      } else {
        return [
          {
            _id: segmentStart._id,
            type: "basal-rate-segment",
            start: segmentStart.deviceTime,
            end: event.deviceTime,
            interval: segmentStart.deviceTime + '/' + event.deviceTime,
            deliveryType: "scheduled",
            scheduleName: segmentStart.scheduleName,
            value: segmentStart.value
          }
        ].concat(eventBuffer, [event]);
      }
    }
  };
}

function tempBasalMappingFn(event) {
  if (event.deliveryType !== 'temp') {
    return event;
  }

  var end = moment(event.deviceTime).add('ms', event.duration).format('YYYY-MM-DDThh:mm:ss');
  return {
    _id: event._id,
    type: 'basal-rate-segment',
    start: event.deviceTime,
    end: end,
    interval: event.deviceTime + '/' + end,
    deliveryType: 'temp',
    value: event.value
  };
}

/**
 * A function that does a self-join on the provided eventStream (an Observable) in order to join together
 * basal records.

 * @param eventStream an Observable to have its bolus events self-joined.
 */
module.exports = function (eventStream) {
  return selfJoin(
    eventStream,
    [
      function(e){
        return isScheduledBasal(e) ? makeNewBasalHandler() : null;
      }
    ]
  ).map(tempBasalMappingFn);
};