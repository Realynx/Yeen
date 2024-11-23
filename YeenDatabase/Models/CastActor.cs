using Microsoft.EntityFrameworkCore;

namespace YeenDatabase.Models {
    public class CastActor {
        [PrimaryKey]
        public Guid Id { get; set; }

        public string Name { get; set; }
        public string ProfilePicture { get; set; }
        public string About { get; set; }
    }
}
