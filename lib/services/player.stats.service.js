angular.module('t2').factory('sendStats', ['$http', function($http) {
	return function(data) {
		return $http.post('/channel-stats', { a: data });
	};
}]);
