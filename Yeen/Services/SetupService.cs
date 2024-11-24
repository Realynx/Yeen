using YeenDatabase;
using YeenDatabase.Models.SettingsTables;

namespace Yeen.Services {
    public class SetupService {
        private readonly YeenLogging.ILogger _logger;
        private readonly YeenDatabaseContext _yeenDatabaseContext;

        public SetupService(YeenLogging.ILogger logger, YeenDatabaseContext yeenDatabaseContext) {
            _logger = logger;
            _yeenDatabaseContext = yeenDatabaseContext;
        }

        public void SetupServer() {
            _logger.Info("Checking server state;");
            if (!(_yeenDatabaseContext.ServerSettings.FirstOrDefault()?.FirstLaunch ?? true)) {
                _logger.Info("This was not the first launch, skipping server setup. If you want to re-setup your server, use the cli tool to reset yeen.");
                return;
            }

            _logger.Info("This is the first server launch, running setup...");

            var settings = new ServerSettings() {
                FirstLaunch = false
            };

            _yeenDatabaseContext.ServerSettings.Add(settings);
            _yeenDatabaseContext.SaveChanges();

            _logger.Info("Setup has been complete.");
        }
    }
}
