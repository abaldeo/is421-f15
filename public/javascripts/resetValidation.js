
$.validator.setDefaults( {
    submitHandler: function (form) {
        form.submit();
    }
} );
$( document ).ready( function () {
    $("#reset").validate({
        rules: {
            password: {
                required: true,
                minlength: 6
            },
            confirm_password: {
                required: true,
                minlength: 6,
                equalTo: "#inputNewPassword"
            }
        },
        messages: {
            password: {
                required: "Please enter a new password",
                minlength: "Your new password must be at least 6 characters long"
            },
            confirm_password: {
                required: "Please re-enter new password",
                minlength: "Your new password must be at least 6 characters long",
                equalTo: "Please enter the same password as above"
            }
        },
        errorElement: "em",
        errorPlacement: function (error, element) {
            // Add the `help-block` class to the error element
            error.addClass("help-block");
            if (element.prop("type") === "checkbox") {
                error.insertAfter(element.parent("label"));
            } else {
                error.insertAfter(element);
            }
        },
        highlight: function (element, errorClass, validClass) {
            $(element).parent(".col-md-10").addClass("has-error").removeClass("has-success");
        },
        unhighlight: function (element, errorClass, validClass) {
            $(element).parent(".col-md-10").addClass("has-success").removeClass("has-error");
        }
    });
});