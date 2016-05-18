var namespace = "urn:x-cast:com.google.ads.imasdk.cast";
window.splashImg = document.getElementById('splash');
window.mediaElement = document.getElementById('media');
window.mediaManager = new cast.receiver.MediaManager(window.mediaElement);
window.castReceiverManager = cast.receiver.CastReceiverManager.getInstance();
window.customMessageBus = window.castReceiverManager
    .getCastMessageBus(namespace);
window.castReceiverManager.start();

/**
 * When chromecast device is disconnected from the sender app.
 */
window.castReceiverManager.onSenderDisconnected = function() {
  window.close();
};

/**
 * Receives messages from sender app.
 */
window.customMessageBus.onMessage = function(event) {
  var message = event.data.split(',');
  var senderId = event.senderId;
  switch (message[0]) {
    case "requestAd":
      requestAd(message[1], message[2]);
      return;
    case "seek":
      seek(parseFloat(message[1]));
      return;
  }
};

/**
 * Sends messages to sender app.
 */
function broadcast(message) {
  window.customMessageBus.broadcast(message);
}

var origOnLoad = window.mediaManager.onLoad.bind(window.mediaManager);
var origOnLoadEvent;

/**
 * Initializes IMA SDK when Media Manager is loaded.
 */
window.mediaManager.onLoad = function(event) {
  origOnLoadEvent = event;
  window.splashImg.style.display = 'none';
  window.mediaElement.style.display = 'block';

  initIMA();
  origOnLoad(origOnLoadEvent);
};

var origOnEnded, origOnSeek;
var adDisplayContainer, adsLoader, adsManager;
var currentContentTime = 0;
var discardAdBreak = -1;

/**
 * Creates new AdsLoader and adds listeners.
 */
function initIMA() {
  adDisplayContainer = new google.ima.AdDisplayContainer(
      document.getElementById('adContainer'), window.mediaElement);
  adDisplayContainer.initialize();
  adsLoader = new google.ima.AdsLoader(adDisplayContainer);
  adsLoader.addEventListener(
      google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onAdsManagerLoaded, false);
  adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, onAdError,
      false);
  adsLoader.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
      onAllAdsCompleted, false);
}

/**
 * Sends AdsManager playAdsAfterTime if starting in the middle of content and
 * starts AdsManager.
 */
function onAdsManagerLoaded(adsManagerLoadedEvent) {
  var adsRenderingSettings = new google.ima.AdsRenderingSettings();
  adsRenderingSettings.playAdsAfterTime = currentContentTime;

  // Get the ads manager.
  adsManager = adsManagerLoadedEvent.getAdsManager(
    window.mediaElement, adsRenderingSettings);

  // Add listeners to the required events.
  adsManager.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      onAdError);
  adsManager.addEventListener(
      google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      onContentPauseRequested);
  adsManager.addEventListener(
      google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      onContentResumeRequested);

  try {
    adsManager.init(window.width, window.height, google.ima.ViewMode.NORMAL);
    adsManager.start();
    origOnEnded = window.mediaManager.onEnded.bind(window.mediaManager);
    origOnSeek = window.mediaManager.onSeek.bind(window.mediaManager);
  } catch (adError) {
    // An error may be thrown if there was a problem with the VAST response.
    broadcast("Ads Manager Error: " + adError);
  }
}

/**
 * Handles errors from AdsLoader and AdsManager.
 */
function onAdError(adErrorEvent) {
  broadcast("Ad Error: " + adErrorEvent.getError().toString());
  // Handle the error logging.
  if (adsManager) {
    adsManager.destroy();
  }
  window.mediaElement.play();
}

/**
 * When content is paused before an ad plays.
 */
function onContentPauseRequested() {
  currentContentTime = window.mediaElement.currentTime;
  window.mediaManager.onEnded = function(event) {};
  window.mediaManager.onSeek = function(event) {};
  broadcast("onContentPauseRequested," + currentContentTime);
}

/**
 * When an ad finishes playing and content resumes.
 */
function onContentResumeRequested() {
  window.mediaManager.onEnded = origOnEnded;
  window.mediaManager.onSeek = origOnSeek;

  origOnLoad(origOnLoadEvent);
  seek(currentContentTime);
  broadcast("onContentResumeRequested");
}

/**
 * Destroys AdsManager when all requested ads have finished playing.
 */
function onAllAdsCompleted() {
  if (adsManager) {
    adsManager.destroy();
  }
}

/**
 * Sets time video should seek to when content resumes and requests ad tag.
 */
function requestAd(adTag, currentTime) {
  if (currentTime != 0) {
    currentContentTime = currentTime;
  }
  var adsRequest = new google.ima.AdsRequest();
  adsRequest.adTagUrl = adTag;
  adsRequest.linearAdSlotWidth = window.mediaElement.width;
  adsRequest.linearAdSlotHeight = window.mediaElement.height;
  adsRequest.nonLinearAdSlotWidth = window.mediaElement.width;
  adsRequest.nonLinearAdSlotHeight = window.mediaElement.height / 3;
  adsLoader.requestAds(adsRequest);
}

/**
 * Seeks content video.
 */
function seek(time) {
  currentContentTime = time;
  window.mediaElement.currentTime = time;
  window.mediaElement.play();
}
