using Microsoft.EntityFrameworkCore;

namespace YeenDatabase.Models {
    public class MediaCollection {
        [PrimaryKey]
        public Guid Id { get; set; }

        public string CollectionTitle { get; set; }
        public ICollection<MediaEntry> CollectionMedia { get; set; }
    }
}
