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

Drupal.Nodejs.callbacks.nodejsBuddyListStartChat = {
  callback: function (message) {
    //alert(message);
  }
};

/**
 * Add behaviours to buddylist elements.
 */
Drupal.behaviors.buddyList = {
  attach: function (context, settings) {
    $('body').append(Drupal.settings.chatbar_settings);
    $('#chatbar .tab-button').click(function () {
      $(this).siblings('.chatbar-pane').slideToggle(100);
    });
    $('.nodejs-buddylist-start-chat-link').click(function (e) {
      e.preventDefault();
      e.stopPropagation();
      var matches = this.href.match(/start-chat-(\d+)/);
      $.ajax({
        type: 'POST',
        url: Drupal.settings.basePath + 'nodejs-buddylist/start-chat',
        dataType: 'json',
        success: function () {},
        data: {uid: matches[1]}
      });
    });
  }
};

})(jQuery);

// vi:ai:expandtab:sw=2 ts=2

