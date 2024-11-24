﻿
using MediaMetadataService.Services;

using Yeen.Services.Interfaces;

using YeenDatabase;
using YeenDatabase.Models.SettingsTables;

namespace Yeen.Services {
    public class SetupService : IHostedService, ISetupService {
        private readonly YeenLogging.ILogger _logger;
        private readonly YeenDatabaseContext _yeenDatabaseContext;
        private readonly MediaDiscoveryService _mediaDiscoveryService;

        public SetupService(YeenLogging.ILogger logger, YeenDatabaseContext yeenDatabaseContext, MediaDiscoveryService mediaDiscoveryService) {
            _logger = logger;
            _yeenDatabaseContext = yeenDatabaseContext;
            _mediaDiscoveryService = mediaDiscoveryService;
        }

        public async Task StartAsync(CancellationToken cancellationToken) {
            await SetupServer();
            InitServices();
        }

        public Task StopAsync(CancellationToken cancellationToken) {
            return Task.CompletedTask;
        }

        public async Task SetupServer() {
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
            await _yeenDatabaseContext.SaveChangesAsync();

            _logger.Info("Setup has been complete.");
        }

        public void InitServices() {
            _logger.Info("Starting server init...");

            _mediaDiscoveryService.ScanMediaDirectory();
        }
    }
}
