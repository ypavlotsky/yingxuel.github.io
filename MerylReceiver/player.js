'use strict';

/**
 * Entry point for the sample video player which uses media element for
 * rendering video streams.
 *
 * @param {!HTMLMediaElement} mediaElement for video rendering.
 */
var Player = function(mediaElement) {
  var namespace = 'urn:x-cast:com.google.ads.ima.meryl.cast';
  var this_ = this;
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
    console.log(event.data);
  };

  this.mediaManager_ = new cast.receiver.MediaManager(this.mediaElement_);
  this.receiverStreamManager_ =
      new google.ima.cast.api.ReceiverStreamManager(this.mediaElement_);
  var onStreamDataReceived = this.onStreamDataReceived.bind(this);
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
        var subtitles = event.getStreamData().subtitles;
        this_.broadcast_('subtitles:');
        this_.broadcast_(subtitles);
        var mediaInfo = {};
        mediaInfo.contentId = streamUrl;
        mediaInfo.contentType = 'application/x-mpegurl';
        onStreamDataReceived(streamUrl);
      },
      false);
  this.receiverStreamManager_.addEventListener(
      google.ima.cast.api.StreamEvent.Type.ERROR,
      function(event) {
        console.log("Got an error: " +event.getStreamData().errorMessage);
      },
      false);
  this.mediaManager_.onLoad = this.onLoad.bind(this);
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
  console.log('Receiver manager start');
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
  var streamRequest = new google.ima.cast.api.StreamRequest(imaRequestData);
  this.receiverStreamManager_.requestStream(streamRequest);
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
  this.broadcast_('onStreamDataReceived');
  var self = this;
  host.processMetadata = function(type, data, timestamp) {
    self.receiverStreamManager_.processMetadata(type, data, timestamp);
  };
  this.castPlayer_ = new cast.player.api.Player(host);
  this.castPlayer_.load(cast.player.api.CreateHlsStreamingProtocol(host));
};
