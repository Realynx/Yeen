using Microsoft.EntityFrameworkCore;

using Yeen.Services.Interfaces;

using YeenDatabase;
using YeenDatabase.Models.SettingsTables;

namespace Yeen.Services {
    public class SetupService : IHostedService, ISetupService {
        private readonly ILogger _logger;
        private readonly YeenDatabaseContext _yeenDatabaseContext;

        public SetupService(ILogger logger, YeenDatabaseContext yeenDatabaseContext) {
            _logger = logger;
            _yeenDatabaseContext = yeenDatabaseContext;
        }

        public async Task SetupServer() {
            _logger.Info("Checking server state;");

            var serverSettings = await _yeenDatabaseContext.ServerSettings.FirstOrDefaultAsync();
            if (!(serverSettings?.FirstLaunch ?? true)) {
                _logger.Info("This was not the first launch, skipping server setup. If you want to re-setup your server, use the cli tool to reset yeen.");
                return;
            }

            _logger.Info("This is the first server launch, running setup...");

            var settings = new ServerSettings() {
                FirstLaunch = false
            };

            _yeenDatabaseContext.ServerSettings.Add(settings);
            await _yeenDatabaseContext.SaveChangesAsync();

            _logger.Info("Setup has been complete.");
        }

        public async Task StartAsync(CancellationToken cancellationToken) {
            await SetupServer();
        }

        public Task StopAsync(CancellationToken cancellationToken) {
            return Task.CompletedTask;
        }
    }
}
