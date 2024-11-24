namespace Yeen.Services.Interfaces {
    public interface ISetupService {
        Task SetupServer();
        Task StartAsync(CancellationToken cancellationToken);
        Task StopAsync(CancellationToken cancellationToken);
    }
}