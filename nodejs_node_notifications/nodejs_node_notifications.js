(function ($) {

Drupal.Nodejs.callbacks.nodejsNodeNotifications = {
  callback: function (message) {
    message = JSON.parse(message);
    switch (message.channel) {
      case 'nodejs_node_notifications':
        $('#nodejs-node-notifications-block').append('<p><a href="/node/' + message.node.nid + '">' + message.node.title + '</a> viewed</p>');
        break;
    }
  }
};

})(jQuery);

