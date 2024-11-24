using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.MediaTables {
    public class MediaEntry {
        [Key]
        public Guid Id { get; set; }

        public string FilePath { get; set; }
        public byte[] Checksum { get; set; }

        public uint PlaybackCount { get; set; }
        public MediaMetadata Metadata { get; set; }
        public ICollection<CastActor> Cast { get; set; }
    }
}
