using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.NewFolder {
    public class MediaEntry {
        [Key]
        public Guid Id { get; set; }

        public string FilePath { get; set; }
        public string Checksum { get; set; }

        public uint PlaybackCount { get; set; }
        public MediaMetadata Metadata { get; set; }
        public ICollection<CastActor> Cast { get; set; }
    }
}
