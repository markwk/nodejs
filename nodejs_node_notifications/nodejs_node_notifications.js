(function ($) {

Drupal.Nodejs.callbacks.nodejsNodeNotifications = {
  callback: function (message) {
    message = JSON.parse(message);
		$('#nodejs-node-notifications-block').append('<p><a href="/node/' + message.node.nid + '">' + message.node.title + '</a> viewed</p>');
  }
};

})(jQuery);

