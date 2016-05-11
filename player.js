var namespace = "urn:x-cast:com.google.ads.imasdk.cast";
window.splashImg = document.getElementById('splash');
window.mediaElement = document.getElementById('media');
window.mediaManager = new cast.receiver.MediaManager(window.mediaElement);
window.castReceiverManager = cast.receiver.CastReceiverManager.getInstance();
window.customMessageBus = window.castReceiverManager.getCastMessageBus(namespace);
window.castReceiverManager.start();

window.castReceiverManager.onSenderDisconnected = function() {
  broadcast("seek," + currentContentTime);
  window.close();
}

window.customMessageBus.onMessage = function(event) {
  var message = event.data.split(',');
  var senderId = event.senderId;
  console.log("Message from: " + senderId + " Message: " + message);
  switch (message[0]) {
    case "requestAd":
      requestAd(message[1], message[2]);
      return;
    case "seek":
      seek(parseFloat(message[1]));
      return;
  }
}

function broadcast(message) {
  window.customMessageBus.broadcast(message);
}

var origOnLoad = window.mediaManager.onLoad.bind(window.mediaManager);
var origOnLoadEvent;

window.mediaManager.onLoad = function(event) {
  console.log('onLoad');
  broadcast('onLoad');
  origOnLoadEvent = event;
  window.splashImg.style.display = 'none';
  window.mediaElement.style.display = 'block';
  
  initIMA();
  origOnLoad(origOnLoadEvent);
}

var origOnEnded, origOnSeek;
var adDisplayContainer, adsLoader, adsManager;
var currentContentTime = 0;
var discardAdBreak = -1;

function initIMA() {
  console.log('initIma');
  adDisplayContainer = new google.ima.AdDisplayContainer(document.getElementById('adContainer'), window.mediaElement);
  adDisplayContainer.initialize();
  adsLoader = new google.ima.AdsLoader(adDisplayContainer);
  adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, onAdsManagerLoaded, false);
  adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, onAdError, false);
  adsLoader.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, onAllAdsCompleted, false);
}

function onAdsManagerLoaded(adsManagerLoadedEvent) {
  console.log('onAdsManagerLoaded');
  broadcast('onAdsManagerLoaded');
  var adsRenderingSettings = new google.ima.AdsRenderingSettings();
  if (currentContentTime != 0) {
    adsRenderingSettings.playAdsAfterTime = currentContentTime;
  }
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
    // Initialize the ads manager. Ad rules playlist will start at this time.
    adsManager.init(640, 360, google.ima.ViewMode.NORMAL);
    // Call play to start showing the ad. Single video and overlay ads will
    // start at this time; the call will be ignored for ad rules.
    adsManager.start();
    origOnEnded = window.mediaManager.onEnded.bind(window.mediaManager);
    origOnSeek = window.mediaManager.onSeek.bind(window.mediaManager);
  } catch (adError) {
    // An error may be thrown if there was a problem with the VAST response.
    broadcast("Ads Manager Error: " + adError);
  }
}

function requestAd(adTag, currentTime) {
  console.log('requestAd');
  currentContentTime = currentTime;
  var adsRequest = new google.ima.AdsRequest();
  adsRequest.adTagUrl = adTag;
  adsRequest.linearAdSlotWidth = window.mediaElement.width;
  adsRequest.linearAdSlotHeight = window.mediaElement.height;
  adsRequest.nonLinearAdSlotWidth = window.mediaElement.width;
  adsRequest.nonLinearAdSlotHeight = window.mediaElement.height / 3;
  adsLoader.requestAds(adsRequest);
  if (currentTime != 0) {
    window.mediaElement.play();
  }
}

function seek(time) {
  currentContentTime = time;
  window.mediaElement.currentTime = time;
  window.mediaElement.play();
}

function onAdError(adErrorEvent) {
  broadcast("Ad Error: " + adErrorEvent.getError().toString());
  // Handle the error logging.
  if (adsManager) {
    adsManager.destroy();
  }
  window.mediaElement.play();
}
    
function onContentPauseRequested() {
  currentContentTime = window.mediaElement.currentTime;
  broadcast("contentPauseRequested: " + currentContentTime);
  window.mediaManager.onEnded = function(event) {};
  window.mediaManager.onSeek = function(event) {
    var requestId = event.data.requestId;
    window.mediaManager.broadcastStatus(true, requestId);
  }
}
    
function onContentResumeRequested() {
  window.mediaManager.onEnded = origOnEnded;
  window.mediaElement.addEventListener('playing', function() {
    var mediaInfo = window.mediaManager.getMediaInformation();
    mediaInfo.duration = window.mediaElement.duration;
    window.mediaManager.setMediaInformation(mediaInfo);
  });
  window.mediaManager.onSeek = origOnSeek;
  window.onEnded = origOnEnded;
  broadcast("contentResumeRequested: " + currentContentTime);
  
  origOnLoad(origOnLoadEvent);
  seek(currentContentTime);
  window.mediaElement.play();
}

function onAllAdsCompleted() {
  if (adsManager) {
    adsManager.destroy();
  }
}
