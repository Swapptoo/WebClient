angular.module("proton.controllers.Conversation", ["proton.constants"])

.controller("ConversationController", function(
    $log,
    $rootScope,
    $scope,
    $state,
    $stateParams,
    $timeout,
    $translate,
    authentication,
    cache,
    CONSTANTS,
    conversation,
    Conversation,
    messages,
    networkActivityTracker,
    notify
) {
    $scope.conversation = conversation;
    $scope.messages = messages;
    $scope.mailbox = $state.current.name.replace('secured.', '').replace('.list', '').replace('.view', '');
    $scope.labels = authentication.user.Labels;

    // Broadcast active status of this current conversation for the conversation list
    $rootScope.$broadcast('activeConversation', conversation.ID);

    // Listeners
    $scope.$on('refreshConversation', function(event, conversation, messages) {
        _.extend($scope.conversation, conversation);
        _.extend($scope.messages, messages);
        // TODO display last new last message
    });

    var currentMailbox = function() {
        return $state.current.name.replace('secured.', '').replace('.list', '').replace('.view', '');
    };

    var currentLocation = function() {
        var mailbox = currentMailbox();
        var location;

        switch(mailbox) {
            case 'label':
                location = $stateParams.label;
                break;
            default:
                location = CONSTANTS.MAILBOX_IDENTIFIERS[mailbox];
                break;
        }

        return location;
    };

    /**
     * Initialization call
     */
    $scope.initialization = function() {
        if($scope.mailbox === 'drafts') {
            // Remove the last message in conversation view
            var popped = $scope.messages.pop();
            // Open it in the composer
            cache.getMessage(popped.ID).then(function(message) {
                message.decryptBody(message.Body, message.Time).then(function(body) {
                    message.Body = body;

                    if(message.Attachments && message.Attachments.length > 0) {
                        message.attachmentsToggle = true;
                    }

                    $rootScope.$broadcast('loadMessage', message);
                }, function(error) {
                    notify({message: 'Error during the decryption of the message', classes: 'notification-danger'});
                    $log.error(error); // TODO send to back-end
                });
            }, function(error) {
                notify({message: 'Error during the getting message', classes: 'notification-danger'});
                $log.error(error); // TODO send to back-end
            });
        }

        $scope.scrollToMessage(_.last($scope.messages));
    };

    $scope.back = function() {
        $state.go("secured." + $scope.mailbox + '.list', {
            id: null // remove ID
        });
    };

    /**
     * Mark current conversation as read
     */
    $scope.read = function() {
        var events = [];
        var conversation = angular.copy($scope.conversation);

        // cache
        conversation.NumUnread = 0;
        events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
        cache.events(events, 'conversation');

        // api
        Conversation.read([conversation.ID]);
        $scope.back();
    };

    /**
     * Mark current conversation as unread
     */
    $scope.unread = function() {
        var events = [];
        var conversation = angular.copy($scope.conversation);

        // cache
        conversation.NumUnread = $scope.messages.length;
        events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
        cache.events(events, 'conversation');

        // api
        Conversation.unread([conversation.ID]);

        // back to conversation list
        $scope.back();
    };

    /**
     * Delete current conversation
     */
    $scope.delete = function() {
        var events = [];
        var conversation = angular.copy($scope.conversation);

        // cache
        events.push({Action: 0, ID: conversation.ID, Conversation: conversation});
        cache.events(events, 'conversation');

        // api
        Conversation.delete([$scope.conversation.ID]);

        // back to conversation list
        $scope.back();
    };

    /**
     * Move current conversation to a specific location
     */
    $scope.move = function(location) {
        var events = [];
        var conversation = angular.copy($scope.conversation);

        // cache
        conversation.LabelIDs = _.without(conversation.LabelIDs, currentLocation()); // remove current location
        conversation.LabelIDs.push(CONSTANTS.MAILBOX_IDENTIFIERS[location]); // Add new location
        events.push({Action: 3, ID: conversation.ID, Conversation: conversation});
        cache.events(events, 'conversation');

        // api
        Conversation[location]([$scope.conversation.ID]);

        // back to conversation list
        $scope.back();
    };

    $scope.conversationMessages = function() {
        return $scope.messages;
    };

    /**
     * Apply labels for the current conversation
     * @return {Promise}
     */
    $scope.saveLabels = function(labels, alsoArchive) {
        var deferred = $q.defer();
        var toApply = _.map(_.where(labels, {Selected: true}), function(label) { return label.ID; });
        var toRemove = _.map(_.where(labels, {Selected: false}), function(label) { return label.ID; });
        var APPLY = 1;
        var REMOVE = 0;

        // Detect if a message will have too many labels
        _.each($scope.messages, function(message) {
            if(_.difference(_.uniq(message.LabelIDs.concat(toApply)), toRemove).length > 5) {
                tooManyLabels = true;
            }
        });

        if(tooManyLabels) {
            deferred.reject(new Error($translate.instant('TOO_MANY_LABELS_ON_MESSAGE')));
        } else {
            _.each(toApply, function(labelID) {
                promises.push(Conversation.labels(labelID, 1, [$scope.conversation.ID]));
            });

            _.each(toRemove, function(labelID) {
                promises.push(Conversation.labels(labelID, 0, [$scope.conversation.ID]));
            });

            $q.all(promises).then(function(results) {
                // TODO generate event
            }, function(error) {
                error.message = $translate.instant('ERROR_DURING_THE_LABELS_REQUEST');
                deferred.reject(error);
            });

            networkActivityTracker.track(deferred.promise);
        }

        return deferred.promise;
    };

    /**
     * Scroll to the message specified
     * @param {Object} message
     */
    $scope.scrollToMessage = function(message) {
        var index = $scope.messages.indexOf(message);
        var id = 'message' + index; // TODO improve it for the search case

        $timeout(function() {
            $('#pm_thread').animate({
                scrollTop: $('#' + id).offset().top - $('#' + id).outerHeight()
            }, 'slow');
        }, 1000);
    };

    /**
     * Toggle star conversation
     */
    $scope.toggleStar = function() {
        if($scope.starred()) {
            Conversation.unstar(conversation.ID);
        } else {
            Conversation.star(conversation.ID);
        }

        // TODO generate event
    };

    /**
     * Return status of the star conversation
     */
    $scope.starred = function() {
        if($scope.conversation.LabelIDs.indexOf(CONSTANTS.MAILBOX_IDENTIFIERS.starred + '') !== -1) {
            return true;
        } else {
            return false;
        }
    };

    /**
     * Go to the next conversation
     */
    $scope.nextConversation = function() {
        var current = $state.current.name;

        cache.more($scope.conversation.ID, 'next').then(function(id) {
            $state.go(current, {id: id});
        });
    };

    /**
     * Go to the previous conversation
     */
    $scope.previousConversation = function() {
        var current = $state.current.name;

        cache.more($scope.conversation.ID, 'previous').then(function(id) {
            $state.go(current, {id: id});
        });
    };

    // Call initialization
    $scope.initialization();
});
