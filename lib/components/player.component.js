function PlayerController($scope, $element, $attrs, $document, $window, twitchFetch) {
    
    // Helper function for element selection
    this.children = function(classes, deep = true) {
        let self = this;
        if (!self.querySelector) {
            self = self[0];
        }
        return deep ? angular.element(self.querySelector(classes))
                : self.querySelector(classes);
    };

    this.$onInit = function() {
        this.hls = new Hls();

        // Load settings from backend
        this.options = Object.assign({
            isVideoFullScreen: false,
            classPrefix: '.video-btn-'
        }, $scope.vp.options);

        this.pfx = this.options.classPrefix;
        this.channel = {};

        // Here we can fetch some data and resolve dependencies

        // Store variables
        // Use classes for better design compatibility
        this.bodyDocument = angular.element('body');
        this.videoNode = this.children.call($element, 'video', false);
        this.video = this.children.call($element, 'video');
        this.videoControls = this.children.call($element, '.video-controls');
        this.play = this.children.call(this.videoControls, this.pfx + 'play');
        this.fs = this.children.call(this.videoControls, this.pfx + 'fs');
        this.progressContainer = this.children.call(this.videoControls, this.pfx + 'progress');
        this.progressBoxNode = this.children.call(this.progressContainer, '.progress_box', false);
        this.playProgress = this.children.call(this.progressContainer, '.play_progress');

        this.volumeRange = this.children.call(this.videoControls, this.pfx + 'volume');
        this.volumeRangeNode = this.children.call(this.videoControls, this.pfx + 'volume', false);

        this.refresh = this.children.call(this.videoControls, this.pfx + 'refresh')
    };

    this.$postLink = function() {
        // When meta data is ready, show the controls
        //this.video.on('loadeddata', this.showHideControls.bind(this));

        // When the full screen button is pressed...
        this.fs.on('click', this.fullScreenToggle.bind(this));

        this.volumeRange.on('click', this.changeVolume.bind(this));

        this.refresh.on('click', () => {
            this.videoNode.currentTime = 0;
            this.updatePlayProgress();
        });

        // When play, pause buttons are pressed.
        this.handleButtonPresses();

        if (!this.options.isStream) {
            this.videoScrubbing();
        }

        // Auto high volume at load
        this.colorActiveVolume(1);
    };

    this.showHideControls = function() {
        this.video
            .on('mouseover', () => {
                this.videoControls.css('opacity', 1);
            })
            .on('mouseout', () => {
                this.videoControls.css('opacity', 0);
            });

        this.videoControls
            .on('mouseover', () => {
                this.videoControls.css('opacity', 1);
            })
            .on('mouseout', () => {
                this.videoControls.css('opacity', 0);
            });
    };

    this.fullScreenToggle = function() {
        this.options.isVideoFullScreen = !this.options.isVideoFullScreen;
        const fs = this.options.isVideoFullScreen;

        // Store video container height before get in fullscreen mode
        if (fs) {
            this.videoHeight = this.video.height();
        }

        // Set new width according to window width
        this.video.css({
            'width:': fs ? ($window.innerWidth + 'px') : '100%',
            'height': fs ? (($window.innerHeight - this.videoControls.height()) + 'px') : this.videoHeight + 'px'
        });

        // Apply a classname to the video and controls, if the designer needs it...
        this.bodyDocument.toggleClass('fullsizeMode');
        this.video.toggleClass('fullsizeVideo');
        this.videoControls.toggleClass('fs-control');
        this.fs.toggleClass('fs-active');

        // Listen for escape key. If pressed, close fullscreen
        $document.on('keydown', this.checkKeyCode.bind(this));
    };

    this.changeVolume = function(e) {
        let volume = e.target.dataset.volume || e.target.parentNode.dataset.volume;

        if (volume) {
            this.videoNode.volume = +volume;
            this.colorActiveVolume(volume);
        }
    };

    this.colorActiveVolume = function(volume) {
        angular.forEach(this.volumeRangeNode.children, function(range){
            const elementRange = angular.element(range);

            if (range.dataset.volume <= volume) {
                elementRange.addClass('active');
            }
            else {
                elementRange.removeClass('active');
            }
        });
    };

    this.handleButtonPresses = function() {
        // When the video or play button is clicked, play/pause the video.
        this.video.on('click', this.playPause.bind(this));
        this.play.on('click', this.playPause.bind(this));

        // When the play button is pressed,
        // switch to the "Pause" symbol.
        this.video.on('play', () => {
            this.play.attr('title', 'Pause');
            this.play.addClass('active');
            this.trackPlayProgress.call(this);
        });

        // When the pause button is pressed,
        // switch to the "Play" symbol.
        this.video.on('pause', () => {
            this.play.attr('title', 'Play');
            this.play.removeClass('active');
            this.stopTrackingPlayProgress();
        });

        // When the video has concluded, pause it.
        this.video.on('ended', () => {
            this.videoNode.currentTime = 0;
            this.videoNode.pause();
        });
    };

    this.playPause = function() {
        if (this.options.isStream && !this.options.manifestParsed)
            throw new Error('check stream manifest');

        if (this.videoNode.paused || this.videoNode.ended) {
            if (this.videoNode.ended) {
                this.videoNode.currentTime = 0;
            }
            this.videoNode.play();

            // For stats module, broadcast play event for future records
            if (this.options.channel && this.options.isStream
                    && !this.options.manifestParsed) {
                $scope.$root.$broadcast('playEvent', this.options.channel);
            }
        }
        else {
            this.videoNode.pause();
        }
    };

    this.trackPlayProgress = function(){
        const self = this;
        // Here IIFE is needed to store the closure context
        (function progressTrack() {
            self.updatePlayProgress();
            self.playProgressInterval = setTimeout(progressTrack, 50);
        })();
    };

    this.updatePlayProgress = function(){
        const offsetWidth = this.progressBoxNode.offsetWidth;
        this.playProgress.css('width',
            ((this.videoNode.currentTime / this.videoNode.duration)
            * offsetWidth) + "px");
    };

    this.stopTrackingPlayProgress = function(){
        clearTimeout(this.playProgressInterval);
    };

    this.videoScrubbing = function() {

        // @todo Upgrade to rxJS version with Observables
        this.progressContainer.on('mousedown', () => {
            this.stopTrackingPlayProgress();

            this.playPause();

            $document.on('mousemove', (e) => {
                this.setPlayProgress.call(this, e.pageX);
            });

            $document.on('mouseup', (e) => {
                $document.off('mouseup');
                $document.off('mousemove');

                this.videoNode.play();
                this.setPlayProgress.call(this, e.pageX);
                this.trackPlayProgress.call(this);
            });
        });
    };

    this.setPlayProgress = function(clickX) {
        const offsetWidth = this.progressBoxNode.offsetWidth;
        const xPos = this.findPosX(this.progressBoxNode);
        const newPercent = Math.max(0, Math.min(1, (clickX - xPos) / offsetWidth));
        this.videoNode.currentTime = newPercent * this.videoNode.duration;
        this.playProgress.css('width', newPercent * offsetWidth  + 'px');
    };

    this.findPosX = function(progressBoxNode) {
        let curleft = progressBoxNode.offsetLeft;
        while (progressBoxNode = progressBoxNode.offsetParent) {
            curleft += progressBoxNode.offsetLeft;
        }
        return curleft;
    };

    this.checkKeyCode = function(e) {
        if ((e.keyCode || e.which) === 27)
            this.fullScreenToggle();
    };

}

PlayerController.$inject = [
  '$scope', '$element', '$attrs', '$document', '$window', 'twitchFetch'
];

angular.module('app').component('videoPlayer', {
    templateUrl: 'components/player.component.html',
    controller: PlayerController,
    bindings: {
        options: '<',
        channel: '='
    },
    controllerAs: 'vp'
});
