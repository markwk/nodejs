(function ($) {

Drupal.Nodejs.presenceCallbacks.buddyList = {
  callback: function (message) {
    if (message.presenceNotification.event == 'offline') {
      $('#nodejs-buddylist-uid-' + message.presenceNotification.uid).removeClass('nodejs-buddylist-online');
      $('#nodejs-buddylist-uid-' + message.presenceNotification.uid).addClass('nodejs-buddylist-offline');
    }
    else {
      $('#nodejs-buddylist-uid-' + message.presenceNotification.uid).addClass('nodejs-buddylist-online');
      $('#nodejs-buddylist-uid-' + message.presenceNotification.uid).removeClass('nodejs-buddylist-offline');
    }
  }
};

})(jQuery);

// vi:ai:expandtab:sw=2 ts=2

