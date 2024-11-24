using Microsoft.Extensions.Configuration;

namespace YeenLogging {
    public class LoggerConfig {
        public LoggerConfig(IConfiguration configuration) {
            configuration.GetSection(nameof(LoggerConfig)).Bind(this);
        }

        public string LogFile { get; set; } = null!;
        public bool DebugLogs { get; set; }
        public bool WriteFile { get; set; }
    }
}
