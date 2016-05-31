'use strict';

var Player = function(mediaElement) {
  var namespace = 'urn:x-cast:com.google.ads.ima.cast';
  this.mediaElement_ = mediaElement;
  console.log(this.mediaElement_);
  this.mediaManager_ = new cast.receiver.MediaManager(this.mediaElement_);
  this.castReceiverManager_ = cast.receiver.CastReceiverManager.getInstance();
  this.imaMessageBus_ = this.castReceiverManager_.getCastMessageBus(namespace);
  console.log(this.imaMessageBus_);
  this.castReceiverManager_.start();

  this.originalOnLoad_ = this.mediaManager_.onLoad.bind(this.mediaManager_);
  this.originalOnEnded_ = this.mediaManager_.onEnded.bind(this.mediaManager_);
  this.originalOnSeek_ = this.mediaManager_.onSeek.bind(this.mediaManager_);

  this.setupCallbacks();
}

Player.prototype.setupCallbacks = function() {
  var self = this;

  // Chromecast device is disconnected from sender app.
  this.castReceiverManager_.onSenderDisconnected = function() {
    window.close();
  };

  //Receives messages from sender app. The message is a comma separated string
  // where the first substring indicates the function to be called and the
  // following substrings are the parameters to be passed to the function.
  this.imaMessageBus_.onMessage = function(event) {
    console.log(event.data);
    var message = event.data.split(',');
    switch (message[0]) {
      case 'requestAd':
        console.log('request ad');
        self.requestAd(message[1], parseFloat(message[2]));
        return;
      case 'seek':
        self.seek(parseFloat(message[1]));
        return;
    }
  };

  // Initializes IMA SDK when Media Manager is loaded.
  this.mediaManager_.onLoad = function(event) {
    self.initIMA();
    self.originalOnLoad_(event);
  };
};

/**
 * Sends messages to all connected sender apps.
 * @param {!string} message Message to be sent to senders.
 */
Player.prototype.broadcast = function(message) {
  this.imaMessageBus_.broadcast(message);
};

/**
 * Creates new AdsLoader and adds listeners.
 */
Player.prototype.initIMA = function() {
  console.log('init ima');
  this.currentContentTime_ = 0;
  var adDisplayContainer = new google.ima.AdDisplayContainer(
      document.getElementById('adContainer'), this.mediaElement_);
  adDisplayContainer.initialize();
  this.adsLoader_ = new google.ima.AdsLoader(adDisplayContainer);
  this.adsLoader_.addEventListener(
      google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      this.onAdsManagerLoaded, false);
  this.adsLoader_.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR,
      this.onAdError, false);
  this.adsLoader_.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
      this.onAllAdsCompleted, false);
};

/**
 * Sends AdsManager playAdsAfterTime if starting in the middle of content and
 * starts AdsManager.
 * @param {ima.AdsManagerLoadedEvent} adsManagerLoadedEvent The loaded event.
 */
Player.prototype.onAdsManagerLoaded = function(adsManagerLoadedEvent) {
  console.log('ads manager loaded');
  var adsRenderingSettings = new google.ima.AdsRenderingSettings();
  adsRenderingSettings.playAdsAfterTime = this.currentContentTime_;

  console.log(this.mediaElement_);
  // Get the ads manager.
  this.adsManager_ = adsManagerLoadedEvent.getAdsManager(
    this.mediaElement_, adsRenderingSettings);

  // Add listeners to the required events.
  this.adsManager_.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      this.onAdError);
  this.adsManager_.addEventListener(
      google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      this.onContentPauseRequested);
  this.adsManager_.addEventListener(
      google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      this.onContentResumeRequested);

  try {
    this.adsManager_.init(this.mediaElement_.width, this.mediaElement_.height,
        google.ima.ViewMode.FULLSCREEN);
    this.adsManager_.start();
  } catch (adError) {
    // An error may be thrown if there was a problem with the VAST response.
    this.broadcast('Ads Manager Error: ' + adError.getMessage());
  }
};

/**
 * Handles errors from AdsLoader and AdsManager.
 * @param {ima.AdErrorEvent.Type.AD_ERROR} adErrorEvent error
 */
Player.prototype.onAdError = function(adErrorEvent) {
  this.broadcast('Ad Error: ' + adErrorEvent.getError().toString());
  // Handle the error logging.
  if (this.adsManager_) {
    this.adsManager_.destroy();
  }
  this.mediaElement_.play();
};

/**
 * When content is paused by AdsManager to start playing an ad.
 */
Player.prototype.onContentPauseRequested = function() {
  console.log('content paused');
  this.currentContentTime_ = this.mediaElement_.currentTime;
  this.mediaManager_.onEnded = function(event) {};
  this.mediaManager_.onSeek = function(event) {};
  this.broadcast('onContentPauseRequested,' + this.currentContentTime_);
};

/**
 * When an ad finishes playing and AdsManager resumes content.
 */
Player.prototype.onContentResumeRequested = function() {
  console.log('content resume');
  this.mediaManager_.onEnded = this.originalOnEnded_;
  this.mediaManager_.onSeek = this.originalOnSeek_;

  this.seek(this.currentContentTime_);
  this.broadcast('onContentResumeRequested');
};

/**
 * Destroys AdsManager when all requested ads have finished playing.
 */
Player.prototype.onAllAdsCompleted = function() {
  if (this.adsManager_) {
    this.adsManager_.destroy();
  }
};

/**
 * Sets time video should seek to when content resumes and requests ad tag.
 * @param {!string} adTag ad tag to be requested.
 * @param {!float} currentTime time of content video we should resume from.
 */
Player.prototype.requestAd = function(adTag, currentTime) {
  console.log('request ad: ' + adTag + ' at time: ' + currentTime);
  if (currentTime != 0) {
    this.currentContentTime_ = currentTime;
  }
  var adsRequest = new google.ima.AdsRequest();
  adsRequest.adTagUrl = adTag;
  adsRequest.linearAdSlotWidth = this.mediaElement_.width;
  adsRequest.linearAdSlotHeight = this.mediaElement_.height;
  adsRequest.nonLinearAdSlotWidth = this.mediaElement_.width;
  adsRequest.nonLinearAdSlotHeight = this.mediaElement_.height / 3;
  this.adsLoader_.requestAds(adsRequest);
};

/**
 * Seeks content video.
 * @param {!float} time time to seek to.
 */
Player.prototype.seek = function(time) {
  this.currentContentTime_ = time;
  this.mediaElement_.currentTime = time;
  this.mediaElement_.play();
};
