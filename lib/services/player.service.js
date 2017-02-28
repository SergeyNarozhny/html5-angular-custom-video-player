angular.module('t2').factory('twitchFetch', ['$http', function($http) {
	return function(data) {
		return $http.post('/twitch-fetch', { a: data.a });
	};
}]);
