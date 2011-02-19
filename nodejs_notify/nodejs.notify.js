
(function ($) {

Drupal.settings.nodejsNotify = Drupal.settings.nodejsNotify || {'dialogDomId': 'nodejs-dialog'};

Drupal.Nodejs.callbacks.nodejsNotify = {
  callback: function (message) {
    switch (message.channel) {
      case 'nodejs_notify':
        $('<div id="' + Drupal.settings.nodejsNotify.dialogDomId + '">' + message.data.subject + '</div>').dialog();
      break;
    }
  }
};

})(jQuery);

