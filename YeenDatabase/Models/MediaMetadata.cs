using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models {
    public class MediaMetadata {
        [Key]
        public Guid Id { get; set; }

        public string Title { get; set; }
        public int ReleaseYear { get; set; }
        public int Rating { get; set; }
        public string Genre { get; set; }
        public string Description { get; set; }

        public uint ChronoDisplayOrder { get; set; }
        public CoverPhoto CoverPhoto { get; set; }
        public ICollection<SearchTag> TagCloud { get; set; }
    }
}
