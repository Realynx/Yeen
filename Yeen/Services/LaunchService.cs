
namespace Yeen.Services {
    public class LaunchService : IHostedService {
        private readonly ILogger _logger;

        public LaunchService(ILogger logger) {
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken) {
            throw new NotImplementedException();
        }

        public Task StopAsync(CancellationToken cancellationToken) {
            throw new NotImplementedException();
        }
    }
}
