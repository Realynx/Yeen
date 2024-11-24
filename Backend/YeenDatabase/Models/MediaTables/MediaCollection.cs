using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.NewFolder {
    public class MediaCollection {
        [Key]
        public Guid Id { get; set; }

        public string CollectionTitle { get; set; }
        public ICollection<Season> Seasons { get; set; }
        public ICollection<Movie> Movies { get; set; }
    }
}
