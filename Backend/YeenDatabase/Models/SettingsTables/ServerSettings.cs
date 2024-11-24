using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.SettingsTables {
    public class ServerSettings {
        [Key]
        public Guid Id { get; set; }

        public bool FirstLaunch { get; set; } = true;
        public bool Tutorial { get; set; } = true;

    }
}
