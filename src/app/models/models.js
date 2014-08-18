angular.module("proton.Models", [
  "ngResource",
  "proton.Auth"
])

.factory("Contact", function($resource, authentication) {
  return $resource(authentication.baseURL + "/contacts/:ContactID", authentication.params(), {
    query: {
      method: "get",
      isArray: true,
      transformResponse: function (data) {
        return JSON.parse(data).data;
      }
    },
    delete: {
      method: "delete",
      isArray: false,
      params: {"ContactID": "@ContactID"}
    }
  });
})

.factory("Message", function($resource, authentication) {
  var Message = $resource(authentication.baseURL + "/messages/:MessageID", authentication.params(), {
    query: {
      method: "get",
      isArray: true,
      transformResponse: function (data) {
        return JSON.parse(data).data;
      }
    },
    delete: {
      method: "delete",
      isArray: false,
      params: {"MessageID": "@MessageID"}
    },
    get: {
      method: "get",
      isArray: false,
      transformResponse: function (data) {
        return JSON.parse(data).data;
      }
    },
    patch: {
      method: "patch",
      isArray: false
    }
  });

  _.extend(Message.prototype, {
    readableTime: function() {
      return moment.unix(this.Time).format('LL');
    },
    toggleStar: function() {
      this.Tag = this.Tag === "starred" ? "" : "starred";
      return Message.patch({MessageID: this.MessageID}, {Tag: this.Tag});
    },
    moveTo: function(location) {
      this.Location = location;
      return Message.patch({MessageID: this.MessageID}, {Location: this.Location});
    },
    delete: function() {
      return this.$delete();
    }
  });

  return Message;
})

.factory("User", function($resource, $injector) {
  var authentication = $injector.get("authentication");
  return $resource(authentication.baseURL + "/user", authentication.params(), {
    get: {
      method: 'get',
      isArray: false,
      transformResponse: function (data) {
        return JSON.parse(data).data;
      }
    }
  });
});
