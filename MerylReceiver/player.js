'use strict';

/**
 * Entry point for the sample video player which uses media element for
 * rendering video streams.
 *
 * @param {!HTMLMediaElement} mediaElement for video rendering.
 */
var Player = function(mediaElement) {
  var namespace = 'urn:x-cast:com.google.ads.ima.meryl.cast';
  var self = this;
  this.adNum_ = 1;
  this.castPlayer_ = null;
  this.mediaElement_ = mediaElement;
  this.receiverManager_ = cast.receiver.CastReceiverManager.getInstance();
  this.receiverManager_.onSenderConnected = function(event) {
    console.log('Sender Connected');
  };
  this.receiverManager_.onSenderDisconnected =
      this.onSenderDisconnected.bind(this);
  this.imaMessageBus_ = this.receiverManager_.getCastMessageBus(namespace);
  this.imaMessageBus_.onMessage = function(event) {
    console.log('Received message from sender: ' + event.data);
    var message = event.data.split(',');
    var method = message[0];
    switch (method) {
      case 'bookmark':
        var time = parseFloat(message[1]);
        self.bookmark_(time);
        break;
      case 'seek':
        var time = parseFloat(message[1]);
        self.seek_(time);
      default:
        self.broadcast_('Message not recognized');
        break;
    }
  };

  this.mediaManager_ = new cast.receiver.MediaManager(this.mediaElement_);
  this.receiverStreamManager_ =
      new google.ima.cast.api.ReceiverStreamManager(this.mediaElement_);
  var onStreamDataReceived = this.onStreamDataReceived.bind(this);
  var sendPingForTesting = this.sendPingForTesting_.bind(this);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.LOADED,
      function(event) {
        var streamUrl = event.getStreamData().url;
        // Each element in subtitles array is an object with url and language
        // properties. Example of a subtitles array with 2 elements:
        // {
        //   "url": "http://www.sis.com/1234/subtitles_en.ttml",
        //   "language": "en"
        // }, {
        //   "url": "http://www.sis.com/1234/subtitles_fr.ttml",
        //   "language": "fr"
        // }
        self.subtitles = event.getStreamData().subtitles;
        console.log(self.subtitles);
        var mediaInfo = {};
        mediaInfo.contentId = streamUrl;
        mediaInfo.contentType = 'application/x-mpegurl';
        onStreamDataReceived(streamUrl);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.ERROR,
      function(event) {
        self.broadcast_(event.getStreamData().errorMessage);
        console.log("Error: " + event.getStreamData().errorMessage);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.CUEPOINTS_CHANGED,
      function(event) {
        console.log("Cuepoints changed: ");
        console.log(event.getStreamData().cuepoints);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.STARTED,
      function(event) {
        self.broadcast_('started');
        sendPingForTesting('start', self.adNum_);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.FIRST_QUARTILE,
      function(event) {
        sendPingForTesting('first', self.adNum_);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.MIDPOINT,
      function(event) {
        sendPingForTesting('mid', self.adNum_);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.THIRD_QUARTILE,
      function(event) {
        sendPingForTesting('third', self.adNum_);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.COMPLETE,
      function(event) {
        self.broadcast_('complete');
        sendPingForTesting('complete', self.adNum_);
        self.adNum_++;
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.AD_BREAK_STARTED,
      function(event) {
        self.broadcast_('ad break started');
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.AD_BREAK_ENDED,
      function(event) {
        self.broadcast_('ad break ended');
      },
      false);
  this.mediaManager_.onLoad = this.onLoad.bind(this);
};


Player.prototype.sendPingForTesting_ = function(event, number) {
  var testingPing = 'http://www.example.com/' + event + '@?num='
      + number + 'ld';
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open('GET', testingPing, true);
  xmlhttp.send();
  this.broadcast_('Pinging url: ' + testingPing);
};


/**
 * Sends messages to all connected sender apps.
 * @param {!String} message Message to be sent to senders.
 * @private
 */
Player.prototype.broadcast_ = function(message) {
  if (this.imaMessageBus_ && this.imaMessageBus_.broadcast) {
    this.imaMessageBus_.broadcast(message);
  }
};


/**
 * Starts receiver manager which tracks playback of the stream.
 */
Player.prototype.start = function() {
  this.receiverManager_.start();
};

/**
 * Called when a sender disconnects from the app.
 * @param {cast.receiver.CastReceiverManager.SenderDisconnectedEvent} event
 */
Player.prototype.onSenderDisconnected = function(event) {
  console.log('onSenderDisconnected');
  // When the last or only sender is connected to a receiver,
  // tapping Disconnect stops the app running on the receiver.
  if (this.receiverManager_.getSenders().length === 0 &&
      event.reason ===
          cast.receiver.system.DisconnectReason.REQUESTED_BY_SENDER) {
    this.receiverManager_.stop();
  }
};

/**
 * Called when we receive a LOAD message from the sender.
 * @param {!cast.receiver.MediaManager.Event} event The load event.
 */
Player.prototype.onLoad = function(event) {
  var imaRequestData = event.data.media.customData;
  //console.log(imaRequestData);
  if (imaRequestData.assetKey) {
    this.streamRequest = new google.ima.cast.api.LiveStreamRequest(imaRequestData);
  } else if (imaRequestData.contentSourceId) {
    this.streamRequest = new google.ima.cast.api.VODStreamRequest(imaRequestData);
  }
  //console.log(this.streamRequest);
  this.receiverStreamManager_.requestStream(this.streamRequest);
};


/**
 * Loads stitched ads+content stream.
 * @param {!string} url of the stream.
 */
Player.prototype.onStreamDataReceived = function(url) {
  var self = this;
  var host = new cast.player.api.Host({
    'url': url,
    'mediaElement': this.mediaElement_
  });
  this.broadcast_('onStreamDataReceived: ' + url);
  var self = this;
  host.processMetadata = function(type, data, timestamp) {
    self.receiverStreamManager_.processMetadata(type, data, timestamp);
  };
  this.castPlayer_ = new cast.player.api.Player(host);
  this.castPlayer_.load(cast.player.api.CreateHlsStreamingProtocol(host));
  this.castPlayer_.enableCaptions(true, 'ttml', this.subtitles[0].ttml);
};

/**
 * Bookmarks content so stream will return to this location if revisited.
 * @param {number} time The time stream will return to in seconds.
 */
Player.prototype.bookmark_ = function() {
  this.broadcast_('Current Time: ' + this.mediaElement_.currentTime);
  var bookmarkTime = this.receiverStreamManager_
    .contentTimeForStreamTime(this.mediaElement_.currentTime);
  this.broadcast_('Bookmark Time: ' + bookmarkTime);
  this.receiverStreamManager_.requestStream(this.streamRequest);
  var newTime =
    this.receiverStreamManager_.streamTimeForContentTime(bookmarkTime);
  this.broadcast_('New Time: ' + newTime);
  this.mediaElement_.currentTime = newTime;
};

/**
 * Seeks player to location.
 * @param {number} time The time to seek to in seconds.
 */
Player.prototype.seek_ = function(time) {
  this.mediaElement_.currentTime = time;
  this.broadcast_('Seeking to: ' + time);
};
